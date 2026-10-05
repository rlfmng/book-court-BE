/**
 * Onboard a venue (tenant) and/or add a staff account. Idempotent: re-running updates the venue
 * name/timezone and resets the user's password and role.
 *
 *   pnpm tenant:create --slug acme-courts --name "Acme Courts" --email owner@acme.ph --password '…'
 *   pnpm tenant:create --slug acme-courts --email desk@acme.ph --password '…' --role staff
 *
 * In the API container (no pnpm/tsx): node dist/scripts/create-tenant.js --slug … (same flags)
 * Omit --password to read it from the TENANT_USER_PASSWORD env var (keeps it out of shell history).
 * With Neon Auth (STAFF_AUTH=neon) pass no password at all: the person signs in with their Neon Auth
 * account using the same email, and the record is linked on their first sign-in.
 */
import { parseArgs } from 'node:util';
import argon2 from 'argon2';
import { createPool } from '../plugins/db.js';

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const usage = `Usage:
  create-tenant --slug <slug> [--name <venue name>] [--timezone Asia/Manila]
                [--email <user email> [--password <password>] [--role owner|staff]]

  Without --password (and TENANT_USER_PASSWORD) the account signs in with Neon Auth only.`;

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
    if (password !== undefined && password.length < 10) fail('the password must be at least 10 characters');
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

    if (email) {
      const hash = password ? await argon2.hash(password) : null;
      await pool.query(
        `INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, lower(email)) DO UPDATE
           SET password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash), role = EXCLUDED.role`,
        [tenantId, email, hash, role],
      );
      console.log(
        password
          ? `Saved ${role} account ${email}`
          : `Saved ${role} account ${email} (no local password: signs in with Neon Auth using this email)`,
      );
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
