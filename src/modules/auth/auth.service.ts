import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { AppError, unauthorized } from '../../utils/errors.js';
import type { Tenant } from '../tenants/tenants.repository.js';
import * as repo from './auth.repository.js';

export function createAuthService(app: FastifyInstance) {
  // Verified when the email is unknown so response time doesn't reveal which emails exist.
  const dummyHash = argon2.hash('timing-equaliser-not-a-real-password');

  return {
    async login(tenant: Tenant, email: string, password: string) {
      const user = await repo.findUserByEmail(app.db, tenant.id, email);
      const ok = await argon2.verify(user?.password_hash ?? (await dummyHash), password).catch(() => false);
      if (!user || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');

      const token = app.jwt.sign({ sub: user.id, tid: tenant.id, email: user.email, role: user.role });
      return {
        token,
        expiresIn: env.JWT_EXPIRES_IN,
        user: { id: user.id, email: user.email, role: user.role },
        tenant: { slug: tenant.slug, name: tenant.name, timezone: tenant.timezone, currency: tenant.currency },
      };
    },

    async me(tenant: Tenant, userId: string) {
      const user = await repo.findUserById(app.db, tenant.id, userId);
      if (!user) throw unauthorized('User no longer exists');
      return { id: user.id, email: user.email, role: user.role };
    },
  };
}
