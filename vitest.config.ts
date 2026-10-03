import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://bookcourt:bookcourt@localhost:5432/bookcourt_test';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    // Integration tests share one database; run files sequentially.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL,
      // Separate Redis logical DB so tests never touch dev cache/locks.
      REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15',
      JWT_SECRET: 'test-secret-test-secret-test-secret-123',
      RATE_LIMIT_ENABLED: 'false',
      SWAGGER_ENABLED: 'false',
    },
  },
});
