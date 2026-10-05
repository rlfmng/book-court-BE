import { readFileSync } from 'node:fs';
import type { ClientConfig } from 'pg';

export type SslMode = 'disable' | 'require' | 'verify';

export interface DatabaseOptions {
  /** Explicit TLS mode; when undefined it's taken from the URL's sslmode (default: disable). */
  ssl?: SslMode;
  /** CA certificate for ssl=verify: PEM text or a path to a PEM file (e.g. Supabase's prod-ca-2021.crt). */
  sslCa?: string;
  /** 0 = don't send statement_timeout (transaction-mode poolers such as PgBouncer reject it). */
  statementTimeoutMs?: number;
}

// libpq parameters node-postgres would otherwise turn into its own TLS config, overriding ours.
const TLS_URL_PARAMS = ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'ssl'];

function modeFromUrl(sslmode: string | null): SslMode | undefined {
  switch (sslmode) {
    case null:
      return undefined;
    case 'disable':
      return 'disable';
    case 'verify-ca':
    case 'verify-full':
      return 'verify';
    default: // allow, prefer, require, no-verify
      return 'require';
  }
}

function readCa(value: string): string {
  return value.includes('-----BEGIN') ? value : readFileSync(value, 'utf8');
}

/**
 * Turns DATABASE_URL + options into a node-postgres config that behaves the same on local Docker,
 * Supabase and Neon. node-postgres treats `sslmode=require` in a URL as full certificate verification
 * and lets it override the `ssl` option, which breaks on Supabase ("self-signed certificate in
 * certificate chain"); here the URL's TLS parameters are stripped and applied explicitly instead.
 */
export function buildPgConfig(databaseUrl: string, opts: DatabaseOptions = {}): ClientConfig & { sslMode: SslMode } {
  const url = new URL(databaseUrl);
  const fromUrl = modeFromUrl(url.searchParams.get('sslmode'));
  for (const p of TLS_URL_PARAMS) url.searchParams.delete(p);

  const sslMode: SslMode = opts.ssl ?? fromUrl ?? 'disable';
  const ssl: ClientConfig['ssl'] =
    sslMode === 'disable'
      ? false
      : sslMode === 'require'
        ? { rejectUnauthorized: false }
        : { rejectUnauthorized: true, ...(opts.sslCa ? { ca: readCa(opts.sslCa) } : {}) };

  return {
    connectionString: url.toString(),
    ssl,
    sslMode,
    application_name: 'book-court-api',
    // Neon may need a few seconds to wake a suspended compute.
    connectionTimeoutMillis: 10_000,
    ...(opts.statementTimeoutMs ? { statement_timeout: opts.statementTimeoutMs } : {}),
  };
}
