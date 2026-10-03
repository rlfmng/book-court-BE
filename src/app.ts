import Fastify, { type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { env } from './config/env.js';
import dbPlugin from './plugins/db.js';
import redisPlugin from './plugins/redis.js';
import errorsPlugin from './plugins/errors.js';
import tenantPlugin from './plugins/tenant.js';
import authPlugin from './plugins/auth.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { courtsRoutes } from './modules/courts/courts.routes.js';
import { availabilityRoutes } from './modules/availability/availability.routes.js';
import { bookingsRoutes } from './modules/bookings/bookings.routes.js';
import { tenantsRoutes } from './modules/tenants/tenants.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { courtsAdminRoutes } from './modules/courts/courts.admin.routes.js';
import { bookingsAdminRoutes } from './modules/bookings/bookings.admin.routes.js';

export async function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'development'
        ? { level: env.LOG_LEVEL, transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } } }
        : {
            level: env.LOG_LEVEL,
            // Never write credentials or customer contact details to logs.
            redact: {
              paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.customerPhone', '*.customerEmail'],
              censor: '[redacted]',
            },
          },
    // Only trust X-Forwarded-For from the configured number of proxy hops (see TRUST_PROXY).
    trustProxy: env.TRUST_PROXY > 0 ? (_address: string, hop: number) => hop < env.TRUST_PROXY : false,
    bodyLimit: env.BODY_LIMIT_BYTES,
    connectionTimeout: 30_000,
    requestTimeout: 30_000,
    ...opts,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(errorsPlugin);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    allowedHeaders: ['content-type', 'authorization', 'x-tenant-slug'],
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  });

  if (env.SWAGGER_ENABLED) {
    await app.register(swagger, {
      openapi: {
        info: { title: 'Book Court PH API', version: '0.1.0', description: 'Multi-tenant court reservation API (demo)' },
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
      },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  await app.register(dbPlugin);
  await app.register(redisPlugin);

  await app.register(healthRoutes);

  // Everything tenant-scoped lives under /api/v1 and requires x-tenant-slug.
  await app.register(
    async (api) => {
      await api.register(rateLimitPlugin);
      await api.register(tenantPlugin);
      await api.register(authPlugin);
      await api.register(tenantsRoutes);
      await api.register(courtsRoutes);
      await api.register(availabilityRoutes);
      await api.register(bookingsRoutes);
      await api.register(authRoutes);
      await api.register(courtsAdminRoutes);
      await api.register(bookingsAdminRoutes);
    },
    { prefix: '/api/v1' },
  );

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
