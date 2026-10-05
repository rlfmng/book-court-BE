import { createRemoteJWKSet, errors as joseErrors, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';

/**
 * Verifies JWTs issued by Neon Auth (hosted Better Auth with its JWT plugin). The token's payload
 * is the Better Auth user (`id`, `email`, `emailVerified`, `name`, ...) and `sub` is the user id.
 * Keys come from the project's JWKS URL and are cached and refreshed by jose.
 */
export interface NeonIdentity {
  authUserId: string;
  email: string;
  emailVerified: boolean;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function keySet() {
  if (!env.NEON_AUTH_JWKS_URL) throw new AppError(404, 'NEON_AUTH_DISABLED', 'Neon Auth sign-in is not enabled');
  jwks ??= createRemoteJWKSet(new URL(env.NEON_AUTH_JWKS_URL), { cooldownDuration: 30_000, timeoutDuration: 5_000 });
  return jwks;
}

export async function verifyNeonToken(token: string): Promise<NeonIdentity> {
  let payload: JWTPayload & { email?: unknown; emailVerified?: unknown; email_verified?: unknown };
  try {
    ({ payload } = await jwtVerify(token, keySet(), {
      ...(env.NEON_AUTH_ISSUER ? { issuer: env.NEON_AUTH_ISSUER } : {}),
      ...(env.NEON_AUTH_AUDIENCE ? { audience: env.NEON_AUTH_AUDIENCE } : {}),
      clockTolerance: 30,
    }));
  } catch (err) {
    if (err instanceof AppError) throw err;
    const expired = err instanceof joseErrors.JWTExpired;
    throw new AppError(401, 'INVALID_TOKEN', expired ? 'Your sign-in expired. Please sign in again.' : 'Invalid sign-in token');
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!payload.sub || !email) throw new AppError(401, 'INVALID_TOKEN', 'Sign-in token is missing the user or email');
  return {
    authUserId: payload.sub,
    email,
    emailVerified: payload.emailVerified === true || payload.email_verified === true,
  };
}

/** For tests: forget cached keys. */
export function resetNeonAuthKeys() {
  jwks = null;
}
