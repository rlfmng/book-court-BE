import fp from 'fastify-plugin';
import type { FastifyError } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { AppError, PG_EXCLUSION_VIOLATION, isPgError } from '../utils/errors.js';

/**
 * Central error handler: every error leaves the API as `{ error: { code, message } }`.
 */
export default fp(
  async (app) => {
    app.setErrorHandler((err: FastifyError, request, reply) => {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      }

      if (hasZodFastifySchemaValidationErrors(err)) {
        const first = err.validation[0];
        const path = first?.instancePath?.replace(/^\//, '').replaceAll('/', '.') || err.validationContext;
        const message = first ? `${path}: ${first.message}` : 'Invalid request';
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message } });
      }

      // Safety net: the service layer maps this too, but never leak a 500 for a double booking.
      if (isPgError(err, PG_EXCLUSION_VIOLATION)) {
        return reply
          .status(409)
          .send({ error: { code: 'SLOT_UNAVAILABLE', message: 'That time slot was just booked. Please pick another.' } });
      }

      if (err.statusCode === 429) {
        return reply
          .status(429)
          .send({ error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.' } });
      }

      if (isResponseSerializationError(err)) {
        request.log.error({ err, cause: err.cause }, 'response serialization failed');
      } else if (err.statusCode && err.statusCode < 500) {
        return reply
          .status(err.statusCode)
          .send({ error: { code: err.code ?? 'BAD_REQUEST', message: err.message } });
      } else {
        request.log.error({ err }, 'unhandled error');
      }

      return reply
        .status(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
    });

    app.setNotFoundHandler((request, reply) => {
      reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` } });
    });
  },
  { name: 'errors' },
);
