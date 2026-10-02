import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { publicRateLimit } from '../../plugins/rate-limit.js';
import { ErrorResponse, TenantHeader, UuidParam } from '../../utils/schemas.js';
import { AvailabilityQuery, AvailabilityResponse } from './availability.schemas.js';
import { createAvailabilityService } from './availability.service.js';

export const availabilityRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createAvailabilityService(app);

  app.get(
    '/courts/:id/availability',
    {
      config: { rateLimit: publicRateLimit },
      schema: {
        tags: ['availability'],
        summary: 'Hourly slots for a court on a local date (cached ~30s)',
        headers: TenantHeader,
        params: UuidParam,
        querystring: AvailabilityQuery,
        response: { 200: AvailabilityResponse, 400: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (request) => ({
      data: await service.getForDate(request.tenant, request.params.id, request.query.date),
    }),
  );
};
