import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { forbidden, unauthorized } from '../utils/errors.js';

export type StaffRole = 'owner' | 'staff';

export interface StaffClaims {
  sub: string; // user id
  tid: string; // tenant id
  email: string;
  role: StaffRole;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: StaffClaims;
    user: StaffClaims;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    /** preHandler: requires a valid staff JWT issued for the request's tenant. */
    authenticate: (request: FastifyRequest) => Promise<void>;
    /** Returns the staff claims when a valid token for this tenant is present, else null. Never throws. */
    optionalStaff: (request: FastifyRequest) => Promise<StaffClaims | null>;
  }
}

/**
 * JWT auth for venue staff. Tokens are scoped to a tenant (`tid` claim) and are rejected on
 * any other tenant's routes. Must be registered after the tenant plugin in the same scope.
 */
export default fp(
  async (app) => {
    await app.register(jwt, {
      secret: env.JWT_SECRET,
      sign: { expiresIn: env.JWT_EXPIRES_IN },
    });

    app.decorate('authenticate', async (request: FastifyRequest) => {
      if (!request.headers.authorization) throw unauthorized();
      try {
        await request.jwtVerify();
      } catch {
        throw unauthorized('Invalid or expired token');
      }
      if (request.user.tid !== request.tenant.id) throw forbidden('Token was issued for a different venue');
    });

    app.decorate('optionalStaff', async (request: FastifyRequest) => {
      if (!request.headers.authorization) return null;
      try {
        await request.jwtVerify();
        return request.user.tid === request.tenant.id ? request.user : null;
      } catch {
        return null;
      }
    });
  },
  { name: 'auth', dependencies: ['tenant'] },
);

/** preHandler factory: restrict a route to specific staff roles (use after `authenticate`). */
export function requireRole(...roles: StaffRole[]) {
  return async (request: FastifyRequest) => {
    if (!roles.includes(request.user.role)) throw forbidden(`Requires role: ${roles.join(' or ')}`);
  };
}
