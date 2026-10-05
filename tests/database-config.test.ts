import { describe, expect, it } from 'vitest';
import { buildPgConfig } from '../src/config/database.js';

const SUPABASE =
  'postgresql://postgres.abcdefghij:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require';
const NEON =
  'postgresql://neondb_owner:secret@ep-cool-name-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

describe('buildPgConfig', () => {
  it('uses plain TCP for local Docker URLs', () => {
    const c = buildPgConfig('postgres://bookcourt:bookcourt@postgres:5432/bookcourt');
    expect(c.sslMode).toBe('disable');
    expect(c.ssl).toBe(false);
  });

  it('turns sslmode=require into TLS without CA checks and strips it from the URL (Supabase)', () => {
    const c = buildPgConfig(SUPABASE);
    expect(c.sslMode).toBe('require');
    expect(c.ssl).toEqual({ rejectUnauthorized: false });
    // Left in the URL, node-postgres would override `ssl` with full verification.
    expect(c.connectionString).not.toContain('sslmode');
    expect(c.connectionString).toContain('pooler.supabase.com:5432/postgres');
  });

  it('keeps unrelated parameters such as channel_binding (Neon)', () => {
    const c = buildPgConfig(NEON);
    expect(c.sslMode).toBe('require');
    expect(c.connectionString).toContain('channel_binding=require');
    expect(c.connectionString).not.toContain('sslmode');
  });

  it('maps verify-full to certificate verification, and an explicit option wins over the URL', () => {
    expect(buildPgConfig(`${NEON.split('?')[0]}?sslmode=verify-full`).ssl).toEqual({ rejectUnauthorized: true });
    expect(buildPgConfig(SUPABASE, { ssl: 'verify', sslCa: '-----BEGIN CERTIFICATE-----\nX\n-----END CERTIFICATE-----' }).ssl).toEqual({
      rejectUnauthorized: true,
      ca: '-----BEGIN CERTIFICATE-----\nX\n-----END CERTIFICATE-----',
    });
    expect(buildPgConfig(SUPABASE, { ssl: 'disable' }).ssl).toBe(false);
  });

  it('only sends statement_timeout when enabled (transaction poolers reject it)', () => {
    expect(buildPgConfig(SUPABASE, { statementTimeoutMs: 10_000 }).statement_timeout).toBe(10_000);
    expect('statement_timeout' in buildPgConfig(SUPABASE, { statementTimeoutMs: 0 })).toBe(false);
  });
});
