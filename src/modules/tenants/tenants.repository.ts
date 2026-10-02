import type { Queryable } from '../../utils/db.js';

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  currency: string;
}

export async function findTenantBySlug(db: Queryable, slug: string): Promise<Tenant | null> {
  const { rows } = await db.query<Tenant>(
    'SELECT id, slug, name, timezone, currency FROM tenants WHERE slug = $1',
    [slug],
  );
  return rows[0] ?? null;
}
