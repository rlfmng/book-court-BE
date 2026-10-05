import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { sensitiveRateLimit } from '../../plugins/rate-limit.js';
import { ErrorResponse, TenantHeader } from '../../utils/schemas.js';
import { LoginBody, LoginResponse, MeResponse, NeonLoginBody } from './auth.schemas.js';
import { createAuthService } from './auth.service.js';

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = createAuthService(app);

  app.post(
    '/auth/login',
    {
      config: { rateLimit: sensitiveRateLimit },
      schema: {
        tags: ['auth'],
        summary: 'Staff login, returns a JWT scoped to the tenant',
        headers: TenantHeader,
        body: LoginBody,
        response: { 200: LoginResponse, 401: ErrorResponse },
      },
    },
    async (request) => ({
      data: await service.login(request.tenant, request.body.email, request.body.password),
    }),
  );

  app.post(
    '/auth/neon',
    {
      config: { rateLimit: sensitiveRateLimit },
      schema: {
        tags: ['auth'],
        summary: 'Exchange a Neon Auth JWT for a staff session (STAFF_AUTH=neon|both)',
        headers: TenantHeader,
        body: NeonLoginBody,
        response: { 200: LoginResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (request) => ({ data: await service.loginWithNeon(request.tenant, request.body.token) }),
  );

  app.get(
    '/auth/me',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['auth'],
        summary: 'Current staff user',
        security: [{ bearerAuth: [] }],
        headers: TenantHeader,
        response: { 200: MeResponse, 401: ErrorResponse },
      },
    },
    async (request) => ({ data: await service.me(request.tenant, request.user.sub) }),
  );
};
