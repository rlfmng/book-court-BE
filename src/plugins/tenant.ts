import fp from 'fastify-plugin';
import { findTenantBySlug, type Tenant } from '../modules/tenants/tenants.repository.js';
import { AppError, notFound } from '../utils/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    tenant: Tenant;
  }
}

const TENANT_HEADER = 'x-tenant-slug';
const CACHE_TTL_SECONDS = 60;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Resolves the tenant from the `x-tenant-slug` header for every route in the scope it is
 * registered in (the /api/v1 scope). Every service/repository call takes `request.tenant.id`.
 *
 * TODO(multi-tenant): resolve from subdomain/custom domain (e.g. demo-arena.bookcourt.ph) as well.
 */
export default fp(
  async (app) => {
    app.decorateRequest('tenant', null as unknown as Tenant);

    app.addHook('onRequest', async (request) => {
      const raw = request.headers[TENANT_HEADER];
      const slug = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
      if (!slug) throw new AppError(400, 'TENANT_REQUIRED', `Missing ${TENANT_HEADER} header`);
      if (!SLUG_RE.test(slug)) throw notFound('TENANT_NOT_FOUND', `Unknown tenant "${slug}"`);

      const cacheKey = `tenant:slug:${slug}`;
      const cached = await app.redis.get(cacheKey).catch(() => null);
      let tenant: Tenant | null = cached ? (JSON.parse(cached) as Tenant) : null;
      if (!tenant) {
        tenant = await findTenantBySlug(app.db, slug);
        if (!tenant) throw notFound('TENANT_NOT_FOUND', `Unknown tenant "${slug}"`);
        await app.redis.set(cacheKey, JSON.stringify(tenant), 'EX', CACHE_TTL_SECONDS).catch(() => undefined);
      }
      request.tenant = tenant;
    });
  },
  { name: 'tenant', dependencies: ['db', 'redis'] },
);
