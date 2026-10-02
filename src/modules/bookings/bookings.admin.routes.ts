import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ErrorResponse, TenantHeader } from '../../utils/schemas.js';
import { AdminBookingsQuery, BookingListResponse, BookingResponse, CreateWalkInBody } from './bookings.schemas.js';
import { createBookingsService } from './bookings.service.js';

/** Staff booking management (owner + staff). */
export const bookingsAdminRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createBookingsService(app);
  app.addHook('onRequest', app.authenticate);

  app.get(
    '/admin/bookings',
    {
      schema: {
        tags: ['admin'],
        summary: 'Bookings for a local date (all courts, all statuses)',
        security: [{ bearerAuth: [] }],
        headers: TenantHeader,
        querystring: AdminBookingsQuery,
        response: { 200: BookingListResponse, 401: ErrorResponse },
      },
    },
    async (request) => {
      const { date, courtId, status } = request.query;
      return service.listForDate(request.tenant, date, { courtId, status });
    },
  );

  app.post(
    '/admin/bookings',
    {
      schema: {
        tags: ['admin'],
        summary: 'Create a manual (walk-in) booking',
        security: [{ bearerAuth: [] }],
        headers: TenantHeader,
        body: CreateWalkInBody,
        response: { 201: BookingResponse, 400: ErrorResponse, 401: ErrorResponse, 409: ErrorResponse },
      },
    },
    async (request, reply) => {
      const booking = await service.create(request.tenant, { ...request.body, source: 'walk_in' });
      return reply.status(201).send({ data: booking });
    },
  );
};
