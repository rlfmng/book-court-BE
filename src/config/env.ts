import 'dotenv/config';
import { z } from 'zod';

const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/** Secrets that ship in examples / docker-compose and must never reach production. */
const PLACEHOLDER_SECRET = /change-me|dev-only|insecure|example|placeholder/i;

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /**
   * Deployment stage. Separate from NODE_ENV (which only selects build/runtime optimisations):
   * APP_ENV=production turns on the strict checks below and production-safe defaults.
   */
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /**
   * How many reverse proxies sit in front of the API (Caddy/nginx/load balancer). Used to read the
   * real client IP from X-Forwarded-For for rate limiting. 0 = not behind a proxy (never trust XFF).
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),

  DATABASE_URL: z.url(),
  /**
   * Optional direct (non-pooled) connection for migrations, which need session features such as
   * advisory locks. Use it when DATABASE_URL points at a transaction-mode pooler. Defaults to DATABASE_URL.
   */
  MIGRATION_DATABASE_URL: z.url().optional(),
  /**
   * disable: plain TCP (Docker network) · require: TLS without CA verification · verify: TLS + CA check.
   * Unset = taken from the URL's sslmode (Supabase/Neon URLs include sslmode=require), else disable.
   */
  DATABASE_SSL: z.enum(['disable', 'require', 'verify']).optional(),
  /** CA for DATABASE_SSL=verify: PEM text or a file path (e.g. Supabase's downloadable CA certificate). */
  DATABASE_SSL_CA: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  /** 0 disables it; required for transaction-mode poolers (Supabase :6543, Neon "-pooler" hosts). */
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(0).default(10_000),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('12h'),

  /**
   * How staff sign in. password: local email + password (argon2). neon: Neon Auth only (the web app
   * signs in at Neon Auth and exchanges its JWT at POST /auth/neon). both: either.
   */
  STAFF_AUTH: z.enum(['password', 'neon', 'both']).default('password'),
  /** Neon Auth JWKS URL (Neon console → Connect → Auth → JWKS URL). Required unless STAFF_AUTH=password. */
  NEON_AUTH_JWKS_URL: z.url().optional(),
  /** Optional extra checks on the Neon Auth JWT's iss / aud claims. */
  NEON_AUTH_ISSUER: z.string().optional(),
  NEON_AUTH_AUDIENCE: z.string().optional(),
  /**
   * Only accept Neon Auth users whose email is verified. Keep this on unless Neon Auth sign-up is
   * disabled: otherwise anyone could register a staff member's email and sign in as them.
   */
  NEON_AUTH_REQUIRE_VERIFIED_EMAIL: booleanish.default(true),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) => v.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean)),

  AVAILABILITY_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(30),
  BOOKING_LOCK_TTL_MS: z.coerce.number().int().positive().default(5000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  RATE_LIMIT_ENABLED: booleanish.default(true),
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).default(64 * 1024),

  /** Defaults to on everywhere except APP_ENV=production. */
  SWAGGER_ENABLED: booleanish.optional(),

  // Seed-only settings (pnpm seed loads the sample venue)
  SEED_OWNER_EMAIL: z.email().default('owner@demo-arena.ph'),
  SEED_OWNER_PASSWORD: z.string().min(8).default('demo-owner-123'),
});

type ParsedEnv = z.infer<typeof EnvSchema>;
export type Env = Omit<ParsedEnv, 'SWAGGER_ENABLED'> & { SWAGGER_ENABLED: boolean; isProduction: boolean };

/** Extra rules that only apply to real deployments. Returns human-readable problems. */
export function productionProblems(e: ParsedEnv): string[] {
  if (e.APP_ENV !== 'production') return [];
  const problems: string[] = [];
  if (PLACEHOLDER_SECRET.test(e.JWT_SECRET)) {
    problems.push('JWT_SECRET looks like a placeholder. Generate one with: openssl rand -base64 48');
  }
  if (e.NODE_ENV !== 'production') problems.push('NODE_ENV must be "production" when APP_ENV=production');
  for (const origin of e.CORS_ORIGINS) {
    if (origin === '*') problems.push('CORS_ORIGINS must list exact origins, not "*"');
    else if (!origin.startsWith('https://')) problems.push(`CORS_ORIGINS entry "${origin}" must use https://`);
  }
  if (e.NEON_AUTH_JWKS_URL && !e.NEON_AUTH_JWKS_URL.startsWith('https://')) {
    problems.push('NEON_AUTH_JWKS_URL must use https://');
  }
  return problems;
}

/** Rules that apply in every stage. */
export function configProblems(e: ParsedEnv): string[] {
  const problems: string[] = [];
  if (e.STAFF_AUTH !== 'password' && !e.NEON_AUTH_JWKS_URL) {
    problems.push(`NEON_AUTH_JWKS_URL is required when STAFF_AUTH=${e.STAFF_AUTH}`);
  }
  return problems;
}

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  const problems = [...configProblems(parsed.data), ...productionProblems(parsed.data)];
  if (problems.length) {
    console.error('Refusing to start with an unsafe or incomplete configuration:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  const isProduction = parsed.data.APP_ENV === 'production';
  return { ...parsed.data, isProduction, SWAGGER_ENABLED: parsed.data.SWAGGER_ENABLED ?? !isProduction };
}

export const env = loadEnv();
