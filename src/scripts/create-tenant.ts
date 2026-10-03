/**
 * Onboard a venue (tenant) and/or add a staff account. Idempotent: re-running updates the venue
 * name/timezone and resets the user's password and role.
 *
 *   pnpm tenant:create --slug acme-courts --name "Acme Courts" --email owner@acme.ph --password '…'
 *   pnpm tenant:create --slug acme-courts --email desk@acme.ph --password '…' --role staff
 *
 * In the API container (no pnpm/tsx): node dist/scripts/create-tenant.js --slug … (same flags)
 * Omit --password to read it from the TENANT_USER_PASSWORD env var (keeps it out of shell history).
 */
import { parseArgs } from 'node:util';
import argon2 from 'argon2';
import { createPool } from '../plugins/db.js';

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const usage = `Usage:
  create-tenant --slug <slug> [--name <venue name>] [--timezone Asia/Manila]
                [--email <user email> [--password <password>] [--role owner|staff]]`;

function fail(message: string): never {
  console.error(`Error: ${message}\n\n${usage}`);
  process.exit(1);
}

async function main() {
  const { values } = parseArgs({
    options: {
      slug: { type: 'string' },
      name: { type: 'string' },
      timezone: { type: 'string', default: 'Asia/Manila' },
      email: { type: 'string' },
      password: { type: 'string' },
      role: { type: 'string', default: 'owner' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(usage);
    return;
  }

  const slug = values.slug?.trim().toLowerCase();
  if (!slug || !SLUG_RE.test(slug)) fail('--slug is required (lowercase letters, numbers and dashes)');
  try {
    new Intl.DateTimeFormat('en', { timeZone: values.timezone });
  } catch {
    fail(`unknown timezone "${values.timezone}"`);
  }
  const email = values.email?.trim().toLowerCase();
  const password = values.password ?? process.env.TENANT_USER_PASSWORD;
  const role = values.role;
  if (email) {
    if (!EMAIL_RE.test(email)) fail(`invalid email "${email}"`);
    if (!password || password.length < 10) fail('a password of at least 10 characters is required for the user');
    if (role !== 'owner' && role !== 'staff') fail('--role must be owner or staff');
  }

  const pool = createPool();
  try {
    const existing = await pool.query<{ id: string; name: string }>('SELECT id, name FROM tenants WHERE slug = $1', [slug]);
    let tenantId = existing.rows[0]?.id;
    if (!tenantId) {
      if (!values.name) fail(`venue "${slug}" does not exist yet; pass --name to create it`);
      const { rows } = await pool.query<{ id: string }>(
        'INSERT INTO tenants (slug, name, timezone) VALUES ($1, $2, $3) RETURNING id',
        [slug, values.name.trim(), values.timezone],
      );
      tenantId = rows[0]!.id;
      console.log(`Created venue "${values.name}" (${slug})`);
    } else if (values.name) {
      await pool.query('UPDATE tenants SET name = $2, timezone = $3 WHERE id = $1', [tenantId, values.name.trim(), values.timezone]);
      console.log(`Updated venue "${values.name}" (${slug})`);
    } else {
      console.log(`Using existing venue "${existing.rows[0]!.name}" (${slug})`);
    }

    if (email && password) {
      const hash = await argon2.hash(password);
      await pool.query(
        `INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, lower(email)) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
        [tenantId, email, hash, role],
      );
      console.log(`Saved ${role} account ${email}`);
    }
    console.log('\nNext: log in at /admin/login and add courts under Courts.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
