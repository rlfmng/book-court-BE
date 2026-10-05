/**
 * Apply pending SQL migrations from ./migrations, using the same connection/TLS handling as the API
 * (works with local Docker Postgres, Supabase and Neon).
 *
 *   pnpm migrate                      (dev, via tsx)
 *   node dist/scripts/migrate.js      (in the container; the entrypoint runs this on start)
 *
 * Uses MIGRATION_DATABASE_URL when set (a direct, non-pooled connection), else DATABASE_URL.
 */
import { runner } from 'node-pg-migrate';
import { env } from '../config/env.js';
import { pgConfig } from '../plugins/db.js';

async function main() {
  const url = env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL;
  // Migrations can legitimately run longer than API queries.
  const { statement_timeout: _ignored, ...config } = pgConfig(url);
  const applied = await runner({
    databaseUrl: config,
    dir: 'migrations',
    migrationsTable: 'pgmigrations',
    direction: 'up',
    checkOrder: true,
    verbose: false,
    log: () => {},
  });
  console.log(applied.length ? `Applied ${applied.length} migration(s): ${applied.map((m) => m.name).join(', ')}` : 'Database is up to date.');
}

main().catch((err) => {
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
