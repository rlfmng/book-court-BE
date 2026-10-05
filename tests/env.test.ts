import { describe, expect, it } from 'vitest';
import { productionProblems } from '../src/config/env.js';

const base = {
  NODE_ENV: 'production',
  APP_ENV: 'production',
  JWT_SECRET: 'q3J9vXH2b6kL0pZr8sTn4WcYu1eFgAoMd5iKjB7hCx',
  CORS_ORIGINS: ['https://book.example-venue.ph'],
} as unknown as Parameters<typeof productionProblems>[0];

describe('productionProblems', () => {
  it('accepts a safe production configuration', () => {
    expect(productionProblems(base)).toEqual([]);
  });

  it('ignores non-production stages', () => {
    expect(productionProblems({ ...base, APP_ENV: 'local', JWT_SECRET: 'change-me-change-me-change-me-change-me' })).toEqual([]);
  });

  it('rejects placeholder secrets, http or wildcard origins and a non-production NODE_ENV', () => {
    const problems = productionProblems({
      ...base,
      NODE_ENV: 'development',
      JWT_SECRET: 'dev-only-insecure-jwt-secret-change-me-please',
      CORS_ORIGINS: ['http://localhost:3000', '*'],
    });
    expect(problems).toHaveLength(4);
  });
});

describe('configProblems', () => {
  it('requires a JWKS URL when staff sign in with Neon Auth', async () => {
    const { configProblems } = await import('../src/config/env.js');
    const cfg = (STAFF_AUTH: string, NEON_AUTH_JWKS_URL?: string) =>
      ({ STAFF_AUTH, NEON_AUTH_JWKS_URL }) as unknown as Parameters<typeof configProblems>[0];
    expect(configProblems(cfg('password'))).toEqual([]);
    expect(configProblems(cfg('neon'))).toHaveLength(1);
    expect(configProblems(cfg('both', 'https://ep-x.neonauth.example/neondb/auth/jwks'))).toEqual([]);
  });
});
