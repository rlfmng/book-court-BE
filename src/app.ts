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
import { healthRoutes } from './modules/health/health.routes.js';

export async function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'development'
        ? { level: env.LOG_LEVEL, transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } } }
        : { level: env.LOG_LEVEL },
    trustProxy: true,
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
        info: { title: 'BookCourt API', version: '0.1.0', description: 'Multi-tenant court reservation API (demo)' },
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

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
