import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { env } from '../config/env.js';

/**
 * Redis-backed rate limiting. Registered with `global: false`; public routes opt in via
 * `config: { rateLimit: publicRateLimit }` so admin traffic is not throttled.
 */
export default fp(
  async (app) => {
    if (!env.RATE_LIMIT_ENABLED) return;
    await app.register(rateLimit, {
      global: false,
      redis: app.redis,
      nameSpace: 'ratelimit:',
      skipOnError: true, // never take the API down because Redis hiccups
      keyGenerator: (request) => `${request.headers['x-tenant-slug'] ?? '-'}:${request.ip}`,
    });
  },
  { name: 'rate-limit', dependencies: ['redis'] },
);

export const publicRateLimit = { max: env.RATE_LIMIT_MAX, timeWindow: env.RATE_LIMIT_WINDOW };
/** Stricter limit for writes and lookups that could be brute-forced. */
export const sensitiveRateLimit = { max: Math.max(10, Math.floor(env.RATE_LIMIT_MAX / 3)), timeWindow: env.RATE_LIMIT_WINDOW };
