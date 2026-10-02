import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import {
  AppError,
  PG_EXCLUSION_VIOLATION,
  PG_UNIQUE_VIOLATION,
  badRequest,
  conflict,
  isPgError,
  notFound,
} from '../../utils/errors.js';
import { normalizePhone } from '../../utils/phone.js';
import { generateReferenceCode, normalizeReferenceCode } from '../../utils/reference.js';
import { localDate, localDateTime, localTimeLabel, shiftDate, startOfLocalDay, timeToMinutes } from '../../utils/time.js';
import { assertBookableDate, invalidateAvailability } from '../availability/availability.service.js';
import { findCourt } from '../courts/courts.repository.js';
import type { Tenant } from '../tenants/tenants.repository.js';
import { acquireLocks } from '../../utils/lock.js';
import * as repo from './bookings.repository.js';
import type { Booking } from './bookings.schemas.js';

export function toBookingDto(row: repo.BookingRow, tenant: Tenant): Booking {
  const tz = tenant.timezone;
  return {
    id: row.id,
    referenceCode: row.reference_code,
    courtId: row.court_id,
    courtName: row.court_name,
    sport: row.sport,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    date: localDate(row.starts_at, tz),
    startTime: localTimeLabel(row.starts_at, tz),
    endTime: localTimeLabel(row.ends_at, tz),
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    hours: (row.ends_at.getTime() - row.starts_at.getTime()) / 3_600_000,
    status: row.status,
    source: row.source,
    totalPrice: Number(row.total_price),
    currency: tenant.currency,
    createdAt: row.created_at.toISOString(),
    cancelledAt: row.cancelled_at?.toISOString() ?? null,
  };
}

export interface CreateBookingInput {
  courtId: string;
  date: string;
  startTime: string;
  hours: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  source: 'online' | 'walk_in';
}

const SLOT_TAKEN = () => conflict('SLOT_UNAVAILABLE', 'That time slot was just booked. Please pick another.');

export function createBookingsService(app: FastifyInstance) {
  async function invalidateFor(tenant: Tenant, row: { court_id: string; starts_at: Date; ends_at: Date }) {
    const dates = new Set([localDate(row.starts_at, tenant.timezone), localDate(new Date(row.ends_at.getTime() - 1), tenant.timezone)]);
    await invalidateAvailability(app.redis, tenant.id, row.court_id, [...dates]);
  }

  return {
    async create(tenant: Tenant, input: CreateBookingInput): Promise<Booking> {
      assertBookableDate(tenant, input.date);

      const court = await findCourt(app.db, tenant.id, input.courtId);
      if (!court || !court.is_active) throw notFound('COURT_NOT_FOUND', 'Court not found');

      // --- Validate the requested slot against the court's hours (all in tenant local time) ---
      const open = timeToMinutes(court.open_time);
      const close = timeToMinutes(court.close_time);
      const start = timeToMinutes(input.startTime);
      const end = start + input.hours * 60;
      if (start < open || end > close || (start - open) % 60 !== 0) {
        throw badRequest(
          'INVALID_SLOT',
          `Pick an hourly slot between ${court.open_time.slice(0, 5)} and ${court.close_time.slice(0, 5)}`,
        );
      }
      const startsAt = localDateTime(input.date, start, tenant.timezone);
      const endsAt = localDateTime(input.date, end, tenant.timezone);
      // Online bookings must start in the future; staff may still book a walk-in for the hour in progress.
      const cutoff = input.source === 'walk_in' ? endsAt : startsAt;
      if (cutoff <= new Date()) throw badRequest('INVALID_SLOT', 'That time slot has already started');

      // Price is always computed server-side.
      const totalPrice = Math.round(Number(court.price_per_hour) * input.hours * 100) / 100;

      // --- Fast-path Redis lock per court+hour; the DB constraint is the real guarantee ---
      const lockKeys = Array.from({ length: input.hours }, (_, i) =>
        `lock:booking:${court.id}:${new Date(startsAt.getTime() + i * 3_600_000).toISOString()}`,
      );
      const lock = await acquireLocks(app.redis, lockKeys, env.BOOKING_LOCK_TTL_MS);
      if (!lock) throw SLOT_TAKEN();

      try {
        let bookingId: string | null = null;
        for (let attempt = 0; attempt < 5 && !bookingId; attempt++) {
          try {
            bookingId = await repo.insertBooking(app.db, tenant.id, {
              courtId: court.id,
              referenceCode: generateReferenceCode(),
              customerName: input.customerName,
              customerPhone: normalizePhone(input.customerPhone),
              customerEmail: input.customerEmail?.toLowerCase() ?? null,
              startsAt,
              endsAt,
              totalPrice,
              source: input.source,
            });
          } catch (err) {
            if (isPgError(err, PG_EXCLUSION_VIOLATION)) throw SLOT_TAKEN();
            if (isPgError(err, PG_UNIQUE_VIOLATION)) continue; // reference code collision: retry
            throw err;
          }
        }
        if (!bookingId) throw new AppError(500, 'INTERNAL_ERROR', 'Could not allocate a booking reference');

        const row = (await repo.findBookingById(app.db, tenant.id, bookingId))!;
        await invalidateFor(tenant, row);

        // TODO(payments): create a pending payment intent (e.g. GCash/Maya via PayMongo) and only
        //   confirm the booking once paid; until then hold the slot with a short expiry.
        // TODO(notifications): send confirmation SMS/email with the reference code.
        return toBookingDto(row, tenant);
      } finally {
        await lock.release();
      }
    },

    /** Public lookup. Both reference and phone must match; a mismatch is indistinguishable from not-found. */
    async lookup(tenant: Tenant, reference: string, phone: string): Promise<Booking> {
      const row = await repo.findBookingByReference(app.db, tenant.id, normalizeReferenceCode(reference));
      if (!row || row.customer_phone !== normalizePhone(phone)) {
        throw notFound('BOOKING_NOT_FOUND', 'No booking found for that reference and phone number');
      }
      return toBookingDto(row, tenant);
    },

    async cancel(
      tenant: Tenant,
      id: string,
      actor: { kind: 'staff' } | { kind: 'customer'; reference: string; phone: string },
    ): Promise<Booking> {
      const row = await repo.findBookingById(app.db, tenant.id, id);
      const notFoundErr = () => notFound('BOOKING_NOT_FOUND', 'Booking not found');
      if (!row) throw notFoundErr();

      if (actor.kind === 'customer') {
        const matches =
          row.reference_code === normalizeReferenceCode(actor.reference) &&
          row.customer_phone === normalizePhone(actor.phone);
        if (!matches) throw notFoundErr();
        if (row.starts_at <= new Date()) {
          throw conflict('BOOKING_NOT_CANCELLABLE', 'This booking has already started and can no longer be cancelled');
        }
        // TODO(policy): enforce a per-tenant cancellation window (e.g. 24h before start) and refunds.
      }

      if (row.status !== 'confirmed' || !(await repo.markCancelled(app.db, tenant.id, id))) {
        throw conflict('BOOKING_NOT_CANCELLABLE', 'This booking is already cancelled');
      }
      await invalidateFor(tenant, row);
      // TODO(notifications): notify the customer about the cancellation.
      // TODO(payments): trigger a refund when paid bookings exist.
      return toBookingDto((await repo.findBookingById(app.db, tenant.id, id))!, tenant);
    },

    async listForDate(
      tenant: Tenant,
      date: string,
      filter: { courtId?: string; status?: 'confirmed' | 'cancelled' },
    ) {
      const from = startOfLocalDay(date, tenant.timezone);
      const to = startOfLocalDay(shiftDate(date, 1), tenant.timezone);
      const rows = await repo.listBookingsBetween(app.db, tenant.id, from, to, filter);
      const data = rows.map((r) => toBookingDto(r, tenant));
      const confirmed = data.filter((b) => b.status === 'confirmed');
      return {
        data,
        meta: {
          date,
          timezone: tenant.timezone,
          total: data.length,
          confirmed: confirmed.length,
          revenue: confirmed.reduce((sum, b) => sum + b.totalPrice, 0),
        },
      };
    },
  };
}
