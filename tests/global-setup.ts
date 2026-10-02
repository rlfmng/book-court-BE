import pg from 'pg';
import { runner } from 'node-pg-migrate';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://bookcourt:bookcourt@localhost:5432/bookcourt_test';

/** Creates the test database if needed and applies all migrations to it. */
export default async function setup() {
  const target = new URL(url);
  const dbName = target.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';

  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!rowCount) await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
  await client.end();

  await runner({
    databaseUrl: url,
    dir: 'migrations',
    migrationsTable: 'pgmigrations',
    direction: 'up',
    log: () => {},
    verbose: false,
  });
}
