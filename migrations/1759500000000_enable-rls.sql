-- Up Migration

-- Defense in depth for hosted Postgres. Supabase publishes every table in the `public` schema through
-- its Data API, where anyone holding the (public) anon key can read and write tables that have Row
-- Level Security disabled. Enabling RLS with no policies denies those roles everything.
--
-- The API is unaffected: it connects as the tables' owner (postgres on Supabase, the owner role on
-- Neon/Docker), and owners bypass RLS. If you ever connect the API as a different, non-owner role,
-- grant it access explicitly (or add policies) first.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pgmigrations ENABLE ROW LEVEL SECURITY;

-- On Supabase, also drop the default grants to its API roles. (These roles don't exist elsewhere.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON tenants, users, courts, bookings, pgmigrations FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON tenants, users, courts, bookings, pgmigrations FROM authenticated;
  END IF;
END $$;

-- Down Migration

ALTER TABLE pgmigrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE courts DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE tenants DISABLE ROW LEVEL SECURITY;
