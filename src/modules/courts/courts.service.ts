import type { FastifyInstance } from 'fastify';
import type { Tenant } from '../tenants/tenants.repository.js';
import { AppError, PG_CHECK_VIOLATION, PG_UNIQUE_VIOLATION, conflict, isPgError, notFound } from '../../utils/errors.js';
import { toHHMM, timeToMinutes } from '../../utils/time.js';
import type { Sport } from '../../utils/schemas.js';
import * as repo from './courts.repository.js';
import type { Court, CreateCourtBody, UpdateCourtBody } from './courts.schemas.js';
import { invalidateCourtAvailability } from '../availability/availability.service.js';

export function toCourtDto(row: repo.CourtRow, tenant: Tenant): Court {
  return {
    id: row.id,
    name: row.name,
    sport: row.sport,
    pricePerHour: Number(row.price_per_hour),
    currency: tenant.currency,
    openTime: toHHMM(row.open_time),
    closeTime: toHHMM(row.close_time),
    isActive: row.is_active,
  };
}

function mapWriteError(err: unknown): never {
  if (isPgError(err, PG_UNIQUE_VIOLATION)) throw conflict('CONFLICT', 'A court with this name already exists');
  if (isPgError(err, PG_CHECK_VIOLATION)) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid court values');
  throw err;
}

export function createCourtsService(app: FastifyInstance) {
  return {
    async list(tenant: Tenant, filter: { sport?: Sport; includeInactive?: boolean }) {
      const rows = await repo.listCourts(app.db, tenant.id, filter);
      return rows.map((r) => toCourtDto(r, tenant));
    },

    /** Public read: inactive courts are hidden unless the caller is staff. */
    async get(tenant: Tenant, courtId: string, opts: { includeInactive?: boolean } = {}) {
      const row = await repo.findCourt(app.db, tenant.id, courtId);
      if (!row || (!row.is_active && !opts.includeInactive)) throw notFound('COURT_NOT_FOUND', 'Court not found');
      return toCourtDto(row, tenant);
    },

    async create(tenant: Tenant, body: CreateCourtBody) {
      const row = await repo.insertCourt(app.db, tenant.id, body).catch(mapWriteError);
      return toCourtDto(row, tenant);
    },

    async update(tenant: Tenant, courtId: string, patch: UpdateCourtBody) {
      const existing = await repo.findCourt(app.db, tenant.id, courtId);
      if (!existing) throw notFound('COURT_NOT_FOUND', 'Court not found');
      const open = patch.openTime ?? existing.open_time;
      const close = patch.closeTime ?? existing.close_time;
      if (timeToMinutes(close) - timeToMinutes(open) < 60) {
        throw new AppError(400, 'VALIDATION_ERROR', 'closeTime must be at least 1 hour after openTime');
      }
      const row = await repo.updateCourt(app.db, tenant.id, courtId, patch).catch(mapWriteError);
      if (!row) throw notFound('COURT_NOT_FOUND', 'Court not found');
      // Hours, price or active flag may change slot output.
      await invalidateCourtAvailability(app.redis, tenant.id, courtId);
      return toCourtDto(row, tenant);
    },
  };
}
