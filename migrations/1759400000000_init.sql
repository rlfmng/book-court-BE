-- Up Migration

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS btree_gist; -- equality operators for uuid inside GiST exclusion constraints

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text NOT NULL,
  timezone    text NOT NULL DEFAULT 'Asia/Manila',
  currency    char(3) NOT NULL DEFAULT 'PHP',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- users (venue staff; customers do not have accounts in the demo)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email          text NOT NULL,
  password_hash  text NOT NULL,
  role           text NOT NULL CHECK (role IN ('owner', 'staff')),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_tenant_email_uq ON users (tenant_id, lower(email));

-- ---------------------------------------------------------------------------
-- courts
-- ---------------------------------------------------------------------------
CREATE TABLE courts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  sport           text NOT NULL CHECK (sport IN ('pickleball', 'basketball', 'badminton')),
  price_per_hour  numeric(10, 2) NOT NULL CHECK (price_per_hour >= 0),
  open_time       time NOT NULL,
  close_time      time NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT courts_hours_chk CHECK (close_time > open_time),
  CONSTRAINT courts_tenant_id_uq UNIQUE (tenant_id, id)  -- target for the tenant-safe FK below
);
CREATE UNIQUE INDEX courts_tenant_name_uq ON courts (tenant_id, lower(name));

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
CREATE TABLE bookings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  court_id         uuid NOT NULL,
  reference_code   text NOT NULL UNIQUE,
  customer_name    text NOT NULL,
  customer_phone   text NOT NULL,
  customer_email   text,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  source           text NOT NULL DEFAULT 'online' CHECK (source IN ('online', 'walk_in')),
  total_price      numeric(10, 2) NOT NULL CHECK (total_price >= 0),
  cancelled_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- A booking can only reference a court of the same tenant.
  CONSTRAINT bookings_court_fk FOREIGN KEY (tenant_id, court_id) REFERENCES courts (tenant_id, id),
  CONSTRAINT bookings_time_chk CHECK (ends_at > starts_at),
  -- THE double-booking guard: no two confirmed bookings on the same court may overlap.
  -- '[)' makes back-to-back bookings (10:00-11:00 and 11:00-12:00) legal.
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    court_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status = 'confirmed')
);
CREATE INDEX bookings_tenant_starts_idx ON bookings (tenant_id, starts_at);
CREATE INDEX bookings_court_starts_idx ON bookings (court_id, starts_at);

-- Down Migration

DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS courts;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS tenants;
