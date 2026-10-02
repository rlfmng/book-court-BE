import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { env } from '../../config/env.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { shiftDate, startOfLocalDay, todayIn } from '../../utils/time.js';
import { findCourt } from '../courts/courts.repository.js';
import type { Tenant } from '../tenants/tenants.repository.js';
import type { AvailabilityResult } from './availability.schemas.js';
import { findConfirmedIntervals } from './availability.repository.js';
import { generateSlots } from './slots.js';

/** How far ahead customers can book. */
export const MAX_DAYS_AHEAD = 60;

const cacheKey = (tenantId: string, courtId: string, date: string) => `avail:${tenantId}:${courtId}:${date}`;

/** Drop cached availability for specific dates (after a booking is created/cancelled). */
export async function invalidateAvailability(redis: Redis, tenantId: string, courtId: string, dates: string[]) {
  if (dates.length === 0) return;
  await redis.del(...dates.map((d) => cacheKey(tenantId, courtId, d))).catch(() => undefined);
}

/** Drop every cached date for a court (after the court itself changes). */
export async function invalidateCourtAvailability(redis: Redis, tenantId: string, courtId: string) {
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', cacheKey(tenantId, courtId, '*'), 'COUNT', 200);
    cursor = next;
    if (keys.length) await redis.del(...keys);
  } while (cursor !== '0');
}

export function assertBookableDate(tenant: Tenant, date: string) {
  const today = todayIn(tenant.timezone);
  if (date < today) throw badRequest('INVALID_SLOT', 'Date is in the past');
  if (date > shiftDate(today, MAX_DAYS_AHEAD)) {
    throw badRequest('INVALID_SLOT', `Bookings open at most ${MAX_DAYS_AHEAD} days ahead`);
  }
}

export function createAvailabilityService(app: FastifyInstance) {
  return {
    async getForDate(tenant: Tenant, courtId: string, date: string): Promise<AvailabilityResult> {
      assertBookableDate(tenant, date);

      const key = cacheKey(tenant.id, courtId, date);
      const cached = await app.redis.get(key).catch(() => null);
      if (cached) return JSON.parse(cached) as AvailabilityResult;

      const court = await findCourt(app.db, tenant.id, courtId);
      if (!court || !court.is_active) throw notFound('COURT_NOT_FOUND', 'Court not found');

      const dayStart = startOfLocalDay(date, tenant.timezone);
      const dayEnd = startOfLocalDay(shiftDate(date, 1), tenant.timezone);
      const bookings = await findConfirmedIntervals(app.db, tenant.id, courtId, dayStart, dayEnd);

      const result: AvailabilityResult = {
        courtId,
        date,
        timezone: tenant.timezone,
        currency: tenant.currency,
        slots: generateSlots({
          date,
          openTime: court.open_time,
          closeTime: court.close_time,
          timeZone: tenant.timezone,
          pricePerHour: Number(court.price_per_hour),
          bookings,
        }),
      };

      await app.redis
        .set(key, JSON.stringify(result), 'EX', env.AVAILABILITY_CACHE_TTL_SECONDS)
        .catch(() => undefined);
      return result;
    },
  };
}
