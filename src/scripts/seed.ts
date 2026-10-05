/**
 * Seeds the demo tenant. Idempotent: safe to run multiple times.
 *   pnpm seed            (dev, via tsx)
 *   node dist/scripts/seed.js   (inside the container)
 */
import argon2 from 'argon2';
import { env } from '../config/env.js';
import { createPool } from '../plugins/db.js';
import { PG_EXCLUSION_VIOLATION, isPgError } from '../utils/errors.js';
import { localDateTime, shiftDate, todayIn } from '../utils/time.js';

const TENANT = { slug: 'demo-arena', name: 'Demo Arena', timezone: 'Asia/Manila' };

const COURTS = [
  { name: 'Pickleball Court 1', sport: 'pickleball', price: 400, open: '06:00', close: '22:00' },
  { name: 'Pickleball Court 2', sport: 'pickleball', price: 400, open: '06:00', close: '22:00' },
  { name: 'Main Basketball Court', sport: 'basketball', price: 1200, open: '07:00', close: '23:00' },
  { name: 'Badminton Court A', sport: 'badminton', price: 350, open: '06:00', close: '21:00' },
] as const;

// [court index, day offset from today, start hour, hours, customer]
const BOOKINGS: Array<[number, number, number, number, string, string, string]> = [
  [0, 0, 18, 1, 'Juan Dela Cruz', '+639171234567', 'juan@example.com'],
  [0, 1, 7, 2, 'Maria Santos', '+639181112222', 'maria@example.com'],
  [1, 0, 19, 1, 'Paolo Reyes', '+639192223333', 'paolo@example.com'],
  [2, 0, 20, 2, 'Team Ballers', '+639203334444', 'ballers@example.com'],
  [3, 1, 17, 1, 'Ana Lim', '+639214445555', 'ana@example.com'],
];

async function main() {
  if (env.isProduction && env.SEED_OWNER_PASSWORD === 'demo-owner-123') {
    throw new Error(
      'Refusing to seed the sample venue in production with the default owner password. ' +
        'Set SEED_OWNER_PASSWORD, or onboard a real venue with `pnpm tenant:create` instead.',
    );
  }
  const pool = createPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [tenant] } = await client.query<{ id: string }>(
      `INSERT INTO tenants (slug, name, timezone) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, timezone = EXCLUDED.timezone
       RETURNING id`,
      [TENANT.slug, TENANT.name, TENANT.timezone],
    );
    if (!tenant) throw new Error('tenant upsert failed');

    const passwordHash = await argon2.hash(env.SEED_OWNER_PASSWORD);
    await client.query(
      `INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, lower($2), $3, 'owner')
       ON CONFLICT (tenant_id, lower(email)) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [tenant.id, env.SEED_OWNER_EMAIL, passwordHash],
    );

    const courtIds: Array<{ id: string; price: number }> = [];
    for (const c of COURTS) {
      const { rows: [court] } = await client.query<{ id: string; price_per_hour: number }>(
        `INSERT INTO courts (tenant_id, name, sport, price_per_hour, open_time, close_time)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, lower(name)) DO UPDATE SET updated_at = now()
         RETURNING id, price_per_hour`,
        [tenant.id, c.name, c.sport, c.price, c.open, c.close],
      );
      if (!court) throw new Error('court upsert failed');
      courtIds.push({ id: court.id, price: Number(court.price_per_hour) });
    }
    await client.query('COMMIT');

    // Sample bookings: each in its own statement so an already-taken slot is simply skipped.
    const today = todayIn(TENANT.timezone);
    let created = 0;
    for (const [i, [courtIdx, dayOffset, hour, hours, name, phone, email]] of BOOKINGS.entries()) {
      const court = courtIds[courtIdx]!;
      const date = shiftDate(today, dayOffset);
      const startsAt = localDateTime(date, hour * 60, TENANT.timezone);
      const endsAt = localDateTime(date, (hour + hours) * 60, TENANT.timezone);
      const reference = `BC-DEMO${String(i + 1).padStart(2, '0')}-${date.replaceAll('-', '').slice(2)}`;
      try {
        const res = await pool.query(
          `INSERT INTO bookings (tenant_id, court_id, reference_code, customer_name, customer_phone, customer_email,
                                 starts_at, ends_at, total_price)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (reference_code) DO NOTHING`,
          [tenant.id, court.id, reference, name, phone, email, startsAt, endsAt, court.price * hours],
        );
        created += res.rowCount ?? 0;
      } catch (err) {
        if (!isPgError(err, PG_EXCLUSION_VIOLATION)) throw err;
      }
    }

    console.log(`Seeded tenant "${TENANT.slug}" (${tenant.id})`);
    // Only echo the password when it's the well-known local demo default.
    const shownPassword = env.SEED_OWNER_PASSWORD === 'demo-owner-123' ? env.SEED_OWNER_PASSWORD : '(from SEED_OWNER_PASSWORD)';
    console.log(`  owner login: ${env.SEED_OWNER_EMAIL} / ${shownPassword}`);
    console.log(`  courts: ${courtIds.length}, new sample bookings: ${created}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(env.isProduction && err instanceof Error ? err.message : err);
  process.exit(1);
});
