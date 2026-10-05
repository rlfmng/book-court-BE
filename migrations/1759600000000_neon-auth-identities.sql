-- Up Migration

-- Staff can sign in through Neon Auth (hosted Better Auth) instead of a local password.
-- password_hash becomes optional, and auth_user_id pins a staff record to one Neon Auth user (the
-- JWT `sub`) on first sign-in, so a different account that later claims the same email is refused.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN auth_user_id text;
CREATE UNIQUE INDEX users_tenant_auth_user_uq ON users (tenant_id, auth_user_id) WHERE auth_user_id IS NOT NULL;

-- Down Migration

DROP INDEX IF EXISTS users_tenant_auth_user_uq;
ALTER TABLE users DROP COLUMN IF EXISTS auth_user_id;
UPDATE users SET password_hash = '!' WHERE password_hash IS NULL; -- '!' never verifies
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
