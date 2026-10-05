import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { AppError, unauthorized } from '../../utils/errors.js';
import type { Tenant } from '../tenants/tenants.repository.js';
import * as repo from './auth.repository.js';
import { verifyNeonToken } from './neon-auth.js';

export function createAuthService(app: FastifyInstance) {
  // Verified when the email is unknown so response time doesn't reveal which emails exist.
  const dummyHash = argon2.hash('timing-equaliser-not-a-real-password');

  function issueSession(tenant: Tenant, user: repo.UserRow) {
    const token = app.jwt.sign({ sub: user.id, tid: tenant.id, email: user.email, role: user.role });
    return {
      token,
      expiresIn: env.JWT_EXPIRES_IN,
      user: { id: user.id, email: user.email, role: user.role },
      tenant: { slug: tenant.slug, name: tenant.name, timezone: tenant.timezone, currency: tenant.currency },
    };
  }

  return {
    /** Local email + password sign-in (STAFF_AUTH=password|both). */
    async login(tenant: Tenant, email: string, password: string) {
      if (env.STAFF_AUTH === 'neon') {
        throw new AppError(403, 'PASSWORD_LOGIN_DISABLED', 'Sign in with your Book Court PH account instead');
      }
      const user = await repo.findUserByEmail(app.db, tenant.id, email);
      // Accounts created for Neon Auth have no local password; verify against the dummy hash anyway.
      const ok = await argon2.verify(user?.password_hash ?? (await dummyHash), password).catch(() => false);
      if (!user?.password_hash || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
      return issueSession(tenant, user);
    },

    /**
     * Neon Auth sign-in (STAFF_AUTH=neon|both): exchange a Neon Auth JWT for a venue-scoped API
     * session. Only staff already registered for this venue (users table) get in; Neon Auth only
     * proves who they are.
     */
    async loginWithNeon(tenant: Tenant, neonToken: string) {
      if (env.STAFF_AUTH === 'password') throw new AppError(404, 'NEON_AUTH_DISABLED', 'Neon Auth sign-in is not enabled');
      const identity = await verifyNeonToken(neonToken);
      if (env.NEON_AUTH_REQUIRE_VERIFIED_EMAIL && !identity.emailVerified) {
        throw new AppError(401, 'EMAIL_NOT_VERIFIED', 'Verify your email address before signing in');
      }
      const user = await repo.findUserByEmail(app.db, tenant.id, identity.email);
      if (!user) throw new AppError(403, 'NOT_STAFF', 'This account is not a staff member of this venue');
      if (user.auth_user_id && user.auth_user_id !== identity.authUserId) {
        // The email now belongs to a different Neon Auth user than the one first linked.
        throw new AppError(403, 'NOT_STAFF', 'This account is not a staff member of this venue');
      }
      if (!user.auth_user_id) await repo.linkAuthUser(app.db, tenant.id, user.id, identity.authUserId);
      return issueSession(tenant, user);
    },

    async me(tenant: Tenant, userId: string) {
      const user = await repo.findUserById(app.db, tenant.id, userId);
      if (!user) throw unauthorized('User no longer exists');
      return { id: user.id, email: user.email, role: user.role };
    },
  };
}
