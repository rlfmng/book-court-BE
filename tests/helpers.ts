import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import type { App } from '../src/app.js';
import { buildApp } from '../src/app.js';
import { shiftDate, todayIn } from '../src/utils/time.js';

export const TZ = 'Asia/Manila';

export interface Fixture {
  app: App;
  tenant: { id: string; slug: string };
  court: { id: string; price: number };
  headers: Record<string, string>;
  /** Login token for the fixture's owner. */
  token: string;
  tomorrow: string;
  cleanup: () => Promise<void>;
}

/**
 * Builds the app against the test DB and creates an isolated tenant (unique slug) with one court
 * and one owner, so test files never interfere with each other or with leftover data.
 */
export async function createFixture(opts: { price?: number; open?: string; close?: string } = {}): Promise<Fixture> {
  const app = await buildApp({ logger: false });
  await app.ready();

  const slug = `test-${randomUUID().slice(0, 8)}`;
  const {
    rows: [tenant],
  } = await app.db.query<{ id: string }>(
    `INSERT INTO tenants (slug, name, timezone) VALUES ($1, 'Test Venue', $2) RETURNING id`,
    [slug, TZ],
  );
  const price = opts.price ?? 400;
  const {
    rows: [court],
  } = await app.db.query<{ id: string }>(
    `INSERT INTO courts (tenant_id, name, sport, price_per_hour, open_time, close_time)
     VALUES ($1, 'Test Court', 'pickleball', $2, $3, $4) RETURNING id`,
    [tenant!.id, price, opts.open ?? '06:00', opts.close ?? '22:00'],
  );
  await app.db.query(
    `INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, 'owner@test.ph', $2, 'owner')`,
    [tenant!.id, await argon2.hash('owner-pass-123')],
  );

  const headers = { 'x-tenant-slug': slug };
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers,
    payload: { email: 'owner@test.ph', password: 'owner-pass-123' },
  });
  const token = login.json().data.token as string;

  return {
    app,
    tenant: { id: tenant!.id, slug },
    court: { id: court!.id, price },
    headers,
    token,
    tomorrow: shiftDate(todayIn(TZ), 1),
    cleanup: async () => {
      await app.db.query('DELETE FROM bookings WHERE tenant_id = $1', [tenant!.id]);
      await app.db.query('DELETE FROM tenants WHERE id = $1', [tenant!.id]);
      await app.close();
    },
  };
}

export function bookingPayload(courtId: string, date: string, startTime: string, extra: Record<string, unknown> = {}) {
  return {
    courtId,
    date,
    startTime,
    customerName: 'Test Customer',
    customerPhone: '0917 123 4567',
    customerEmail: 'customer@example.com',
    ...extra,
  };
}
