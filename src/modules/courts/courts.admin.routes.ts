import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireRole } from '../../plugins/auth.js';
import { ErrorResponse, TenantHeader, UuidParam } from '../../utils/schemas.js';
import { Court, CreateCourtBody, UpdateCourtBody } from './courts.schemas.js';
import { createCourtsService } from './courts.service.js';

/** Court management — owners only. */
export const courtsAdminRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createCourtsService(app);
  const guard = { onRequest: [app.authenticate], preHandler: [requireRole('owner')] };

  app.post(
    '/courts',
    {
      ...guard,
      schema: {
        tags: ['courts'],
        summary: 'Create a court (owner)',
        security: [{ bearerAuth: [] }],
        headers: TenantHeader,
        body: CreateCourtBody,
        response: { 201: z.object({ data: Court }), 400: ErrorResponse, 401: ErrorResponse, 409: ErrorResponse },
      },
    },
    async (request, reply) => reply.status(201).send({ data: await service.create(request.tenant, request.body) }),
  );

  app.patch(
    '/courts/:id',
    {
      ...guard,
      schema: {
        tags: ['courts'],
        summary: 'Update a court (owner)',
        security: [{ bearerAuth: [] }],
        headers: TenantHeader,
        params: UuidParam,
        body: UpdateCourtBody,
        response: { 200: z.object({ data: Court }), 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (request) => ({ data: await service.update(request.tenant, request.params.id, request.body) }),
  );
};
