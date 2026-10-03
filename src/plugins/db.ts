import fp from 'fastify-plugin';
import pg from 'pg';
import { env } from '../config/env.js';

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of JS Dates (avoids TZ shifts).
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
// NUMERIC -> number (prices are small, two-decimal values).
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));

declare module 'fastify' {
  interface FastifyInstance {
    db: pg.Pool;
  }
}

export function createPool(connectionString = env.DATABASE_URL) {
  return new pg.Pool({
    connectionString,
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Kill runaway queries instead of letting them hold connections.
    statement_timeout: env.DATABASE_STATEMENT_TIMEOUT_MS,
    application_name: 'book-court-api',
    // Managed Postgres (RDS, Cloud SQL, Supabase, Neon...) usually requires TLS.
    ssl: env.DATABASE_SSL === 'disable' ? undefined : { rejectUnauthorized: env.DATABASE_SSL === 'verify' },
  });
}

export default fp(
  async (app) => {
    const pool = createPool();
    await pool.query('SELECT 1');
    app.decorate('db', pool);
    app.addHook('onClose', async () => {
      await pool.end();
    });
  },
  { name: 'db' },
);
