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
  return new pg.Pool({ connectionString, max: 10 });
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
