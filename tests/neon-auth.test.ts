import { createServer, type Server } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFixture, type Fixture } from './helpers.js';

// Stand-in for Neon Auth: an EdDSA key whose public half is served as a JWKS, and tokens shaped
// like Better Auth's JWT plugin output (payload = user, sub = user id, 15 min expiry).
let fx: Fixture;
let jwksServer: Server;
let neonKey: CryptoKey;
let otherKey: CryptoKey;

const sign = (
  claims: Record<string, unknown>,
  { key = neonKey, exp = '15m', kid = 'neon-1' }: { key?: CryptoKey; exp?: string; kid?: string } = {},
) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'EdDSA', kid })
    .setIssuedAt()
    .setIssuer('https://ep-test.neonauth.example')
    .setExpirationTime(exp)
    .sign(key);

const exchange = (token: string) =>
  fx.app.inject({ method: 'POST', url: '/api/v1/auth/neon', headers: fx.headers, payload: { token } });

beforeAll(async () => {
  const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  neonKey = pair.privateKey;
  otherKey = (await generateKeyPair('EdDSA', { crv: 'Ed25519' })).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'neon-1', alg: 'EdDSA' };
  jwksServer = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => jwksServer.listen(47123, '127.0.0.1', resolve));

  fx = await createFixture();
  // A desk staff member created for Neon Auth only (no local password).
  await fx.app.db.query(`INSERT INTO users (tenant_id, email, role) VALUES ($1, 'desk@test.ph', 'staff')`, [fx.tenant.id]);
});

afterAll(async () => {
  await fx?.cleanup();
  await new Promise((resolve) => jwksServer?.close(resolve));
});

describe('Neon Auth sign-in (POST /auth/neon)', () => {
  it('exchanges a verified Neon Auth token for a venue-scoped staff session', async () => {
    const res = await exchange(await sign({ sub: 'neon-user-1', email: 'Desk@Test.ph', emailVerified: true, name: 'Desk' }));
    expect(res.statusCode).toBe(200);
    const { token, user } = res.json().data;
    expect(user).toMatchObject({ email: 'desk@test.ph', role: 'staff' });

    const me = await fx.app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { ...fx.headers, authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(200);
  });

  it('pins the staff record to the first Neon Auth user and refuses another account with the same email', async () => {
    const other = await exchange(await sign({ sub: 'neon-user-2', email: 'desk@test.ph', emailVerified: true }));
    expect(other.statusCode).toBe(403);
    expect(other.json().error.code).toBe('NOT_STAFF');
    // The original account still works.
    expect((await exchange(await sign({ sub: 'neon-user-1', email: 'desk@test.ph', emailVerified: true }))).statusCode).toBe(200);
  });

  it('rejects unverified emails, people who are not staff, and bad tokens', async () => {
    const unverified = await exchange(await sign({ sub: 'neon-user-3', email: 'owner@test.ph', emailVerified: false }));
    expect(unverified.statusCode).toBe(401);
    expect(unverified.json().error.code).toBe('EMAIL_NOT_VERIFIED');

    const stranger = await exchange(await sign({ sub: 'neon-user-4', email: 'player@gmail.com', emailVerified: true }));
    expect(stranger.statusCode).toBe(403);

    const forged = await exchange(await sign({ sub: 'neon-user-1', email: 'desk@test.ph', emailVerified: true }, { key: otherKey }));
    expect(forged.statusCode).toBe(401);
    expect(forged.json().error.code).toBe('INVALID_TOKEN');

    const expired = await exchange(await sign({ sub: 'neon-user-1', email: 'desk@test.ph', emailVerified: true }, { exp: '-5m' }));
    expect(expired.statusCode).toBe(401);
    expect(expired.json().error.message).toMatch(/expired/i);

    const garbage = await exchange('x'.repeat(40));
    expect(garbage.statusCode).toBe(401);
  });

  it('keeps password sign-in for accounts that have a password, and refuses it for Neon-only accounts', async () => {
    const owner = await fx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: fx.headers,
      payload: { email: 'owner@test.ph', password: 'owner-pass-123' },
    });
    expect(owner.statusCode).toBe(200);

    const desk = await fx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: fx.headers,
      payload: { email: 'desk@test.ph', password: 'anything-at-all' },
    });
    expect(desk.statusCode).toBe(401);
  });
});
