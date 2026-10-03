import type { Queryable } from '../../utils/db.js';

export interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  role: 'owner' | 'staff';
}

export async function findUserByEmail(db: Queryable, tenantId: string, email: string): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(
    'SELECT id, tenant_id, email, password_hash, role FROM users WHERE tenant_id = $1 AND lower(email) = lower($2)',
    [tenantId, email],
  );
  return rows[0] ?? null;
}

export async function findUserById(db: Queryable, tenantId: string, id: string): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(
    'SELECT id, tenant_id, email, password_hash, role FROM users WHERE tenant_id = $1 AND id = $2',
    [tenantId, id],
  );
  return rows[0] ?? null;
}
