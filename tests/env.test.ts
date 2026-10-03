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
