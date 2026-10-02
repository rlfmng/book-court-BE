import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { publicRateLimit } from '../../plugins/rate-limit.js';
import { ErrorResponse, TenantHeader, UuidParam } from '../../utils/schemas.js';
import { Court, CourtListQuery } from './courts.schemas.js';
import { createCourtsService } from './courts.service.js';

export const courtsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createCourtsService(app);

  app.get(
    '/courts',
    {
      config: { rateLimit: publicRateLimit },
      schema: {
        tags: ['courts'],
        summary: 'List courts (optionally filtered by sport)',
        headers: TenantHeader,
        querystring: CourtListQuery,
        response: { 200: z.object({ data: z.array(Court) }), 400: ErrorResponse },
      },
    },
    async (request) => {
      const { sport, includeInactive } = request.query;
      // Only authenticated staff may see inactive courts.
      const staff = includeInactive ? await app.optionalStaff(request) : null;
      return { data: await service.list(request.tenant, { sport, includeInactive: Boolean(staff) }) };
    },
  );

  app.get(
    '/courts/:id',
    {
      config: { rateLimit: publicRateLimit },
      schema: {
        tags: ['courts'],
        summary: 'Get a court',
        headers: TenantHeader,
        params: UuidParam,
        response: { 200: z.object({ data: Court }), 404: ErrorResponse },
      },
    },
    async (request) => {
      const staff = await app.optionalStaff(request);
      return { data: await service.get(request.tenant, request.params.id, { includeInactive: Boolean(staff) }) };
    },
  );
};
