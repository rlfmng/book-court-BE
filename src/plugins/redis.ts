import fp from 'fastify-plugin';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

export default fp(
  async (app) => {
    const redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    await redis.connect();
    app.decorate('redis', redis);
    app.addHook('onClose', async () => {
      await redis.quit();
    });
  },
  { name: 'redis' },
);
