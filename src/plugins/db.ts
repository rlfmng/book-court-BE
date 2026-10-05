import fp from 'fastify-plugin';
import pg from 'pg';
import { env } from '../config/env.js';
import { buildPgConfig } from '../config/database.js';

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of JS Dates (avoids TZ shifts).
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
// NUMERIC -> number (prices are small, two-decimal values).
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));

declare module 'fastify' {
  interface FastifyInstance {
    db: pg.Pool;
  }
}

/** node-postgres config for DATABASE_URL (or another URL, e.g. MIGRATION_DATABASE_URL). */
export function pgConfig(connectionString = env.DATABASE_URL) {
  const { sslMode: _sslMode, ...config } = buildPgConfig(connectionString, {
    ssl: env.DATABASE_SSL,
    sslCa: env.DATABASE_SSL_CA,
    // Kill runaway queries instead of letting them hold connections.
    statementTimeoutMs: env.DATABASE_STATEMENT_TIMEOUT_MS,
  });
  return config;
}

export function createPool(connectionString = env.DATABASE_URL) {
  return new pg.Pool({ ...pgConfig(connectionString), max: env.DATABASE_POOL_MAX, idleTimeoutMillis: 30_000 });
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
