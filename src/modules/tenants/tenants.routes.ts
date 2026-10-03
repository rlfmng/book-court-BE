import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { publicRateLimit } from '../../plugins/rate-limit.js';
import { ErrorResponse, TenantHeader } from '../../utils/schemas.js';

const TenantResponse = z.object({
  data: z.object({ slug: z.string(), name: z.string(), timezone: z.string(), currency: z.string() }),
});

export const tenantsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/tenant',
    {
      config: { rateLimit: publicRateLimit },
      schema: {
        tags: ['tenant'],
        summary: 'Public info about the current venue (name, timezone, currency)',
        headers: TenantHeader,
        response: { 200: TenantResponse, 404: ErrorResponse },
      },
    },
    async (request) => {
      const { slug, name, timezone, currency } = request.tenant;
      return { data: { slug, name, timezone, currency } };
    },
  );
};
