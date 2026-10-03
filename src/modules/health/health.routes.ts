import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['up', 'down']),
  redis: z.enum(['up', 'down']),
  time: z.string(),
});

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Liveness/readiness check',
        response: { 200: HealthResponse, 503: HealthResponse },
      },
    },
    async (_request, reply) => {
      const [db, redis] = await Promise.all([
        app.db.query('SELECT 1').then(() => 'up' as const, () => 'down' as const),
        app.redis.ping().then(() => 'up' as const, () => 'down' as const),
      ]);
      const status = db === 'up' && redis === 'up' ? 'ok' : 'degraded';
      return reply.status(status === 'ok' ? 200 : 503).send({ status, db, redis, time: new Date().toISOString() });
    },
  );
};
