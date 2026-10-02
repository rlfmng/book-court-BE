import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { publicRateLimit, sensitiveRateLimit } from '../../plugins/rate-limit.js';
import { badRequest } from '../../utils/errors.js';
import { ErrorResponse, TenantHeader, UuidParam } from '../../utils/schemas.js';
import { BookingResponse, CancelBody, CreateBookingBody, LookupQuery } from './bookings.schemas.js';
import { createBookingsService } from './bookings.service.js';

export const bookingsRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createBookingsService(app);

  app.post(
    '/bookings',
    {
      config: { rateLimit: sensitiveRateLimit },
      schema: {
        tags: ['bookings'],
        summary: 'Book a slot (public, no account needed)',
        headers: TenantHeader,
        body: CreateBookingBody,
        response: { 201: BookingResponse, 400: ErrorResponse, 404: ErrorResponse, 409: ErrorResponse },
      },
    },
    async (request, reply) => {
      const booking = await service.create(request.tenant, { ...request.body, source: 'online' });
      return reply.status(201).send({ data: booking });
    },
  );

  app.get(
    '/bookings/lookup',
    {
      config: { rateLimit: sensitiveRateLimit },
      schema: {
        tags: ['bookings'],
        summary: 'Find a booking by reference code + phone number',
        headers: TenantHeader,
        querystring: LookupQuery,
        response: { 200: BookingResponse, 404: ErrorResponse },
      },
    },
    async (request) => ({
      data: await service.lookup(request.tenant, request.query.reference, request.query.phone),
    }),
  );

  app.post(
    '/bookings/:id/cancel',
    {
      config: { rateLimit: publicRateLimit },
      schema: {
        tags: ['bookings'],
        summary: 'Cancel a booking (customer: reference + phone; staff: bearer token)',
        headers: TenantHeader,
        params: UuidParam,
        body: CancelBody,
        response: { 200: BookingResponse, 400: ErrorResponse, 404: ErrorResponse, 409: ErrorResponse },
      },
    },
    async (request) => {
      const staff = await app.optionalStaff(request);
      if (staff) return { data: await service.cancel(request.tenant, request.params.id, { kind: 'staff' }) };

      const { reference, phone } = request.body ?? {};
      if (!reference || !phone) {
        throw badRequest('VALIDATION_ERROR', 'reference and phone are required to cancel a booking');
      }
      return { data: await service.cancel(request.tenant, request.params.id, { kind: 'customer', reference, phone }) };
    },
  );
};
