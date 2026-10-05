import type { Queryable } from '../../utils/db.js';

export interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string | null;
  auth_user_id: string | null;
  role: 'owner' | 'staff';
}

export async function findUserByEmail(db: Queryable, tenantId: string, email: string): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(
    'SELECT id, tenant_id, email, password_hash, auth_user_id, role FROM users WHERE tenant_id = $1 AND lower(email) = lower($2)',
    [tenantId, email],
  );
  return rows[0] ?? null;
}

export async function findUserById(db: Queryable, tenantId: string, id: string): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(
    'SELECT id, tenant_id, email, password_hash, auth_user_id, role FROM users WHERE tenant_id = $1 AND id = $2',
    [tenantId, id],
  );
  return rows[0] ?? null;
}

/** Pin a staff record to its Neon Auth user on first sign-in. No-op if it's already pinned. */
export async function linkAuthUser(db: Queryable, tenantId: string, userId: string, authUserId: string): Promise<void> {
  await db.query('UPDATE users SET auth_user_id = $3 WHERE tenant_id = $1 AND id = $2 AND auth_user_id IS NULL', [
    tenantId,
    userId,
    authUserId,
  ]);
}
