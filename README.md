# book-court-BE · Book Court PH

API for **Book Court PH**, a multi-tenant court reservation platform for venues with pickleball,
basketball and badminton courts. Built for the Philippines: times are handled in each venue's
timezone (`Asia/Manila` by default) and prices are in PHP.

This is the demo backend. The web app lives in [`book-court-FE`](https://github.com/rlfmng/book-court-FE).

**Stack:** Node.js 22 · TypeScript · Fastify 5 · Zod 4 (`fastify-type-provider-zod`) · PostgreSQL 16 ·
Redis 7 · node-pg-migrate (plain SQL) · argon2 · JWT · Vitest · Docker

---

## Quick start (Docker)

```bash
cp .env.example .env          # defaults work out of the box
docker compose up -d --build  # postgres + redis + api; migrations run automatically
pnpm install
pnpm seed                     # loads the demo-arena tenant (runs on your machine against localhost:5432)
```

- API: http://localhost:4000 (health: `GET /health`)
- OpenAPI docs: http://localhost:4000/docs
- Demo owner login: `owner@demo-arena.ph` / `demo-owner-123`

```bash
curl -H 'x-tenant-slug: demo-arena' http://localhost:4000/api/v1/courts
```

To seed from inside the container instead of the host, run:
`docker compose exec api node dist/scripts/seed.js`.

## Local development (without the API container)

```bash
docker compose up -d postgres redis   # or use your own Postgres 16 + Redis 7
pnpm install
pnpm migrate
pnpm seed
pnpm dev                               # http://localhost:4000, reloads on change
```

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Start the API with `tsx watch` (pretty logs) |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run the compiled API (`node dist/server.js`) |
| `pnpm migrate` | Apply pending SQL migrations (`migrations/`). Uses the same TLS handling as the API (works with Neon). In the container: `node dist/scripts/migrate.js` (the entrypoint runs it on start) |
| `pnpm migrate:down` | Roll back the last migration |
| `pnpm migrate:create <name>` | Create a new SQL migration file |
| `pnpm seed` | Seed the sample venue (Demo Arena): owner, 4 courts and sample bookings (idempotent) |
| `pnpm tenant:create --slug … --name … --email … --password …` | Onboard a real venue and its owner, or add a staff account (`--role staff`). In the container: `node dist/scripts/create-tenant.js …` |
| `pnpm test` | Run Vitest (unit + integration; needs Postgres and Redis) |
| `pnpm typecheck` | `tsc --noEmit` |

## Environment variables

All variables are validated at startup with Zod (`src/config/env.ts`). The process exits with a
clear message if any are invalid. See `.env.example`.

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `APP_ENV` | `local` | `local` \| `staging` \| `production`. `production` enables the startup safety checks (see below) and turns Swagger off by default |
| `TRUST_PROXY` | `0` | Number of reverse proxies in front of the API. Used to read the real client IP for rate limiting. `0` ignores `X-Forwarded-For` |
| `HOST` / `PORT` | `0.0.0.0` / `4000` | Listen address |
| `LOG_LEVEL` | `info` | Pino log level |
| `DATABASE_URL` | – (required) | Postgres connection string |
| `MIGRATION_DATABASE_URL` | = `DATABASE_URL` | Optional direct (non-pooled) connection for migrations, which need session features. Use it when `DATABASE_URL` points at a transaction-mode pooler |
| `DATABASE_SSL` | from the URL's `sslmode` | `disable` \| `require` (TLS, no CA check) \| `verify` (TLS + CA check). Unset follows the URL's `sslmode` (Neon and Supabase URLs include `sslmode=require`) |
| `DATABASE_SSL_CA` | – | CA certificate for `verify` (PEM text or file path). Neon uses a public CA, so it isn't needed there |
| `DATABASE_POOL_MAX` | `10` | Max Postgres connections per API instance |
| `DATABASE_STATEMENT_TIMEOUT_MS` | `10000` | Queries running longer than this are cancelled. `0` disables it, which transaction-mode poolers (Neon `-pooler` hosts) require |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `JWT_SECRET` | – (required, ≥ 32 chars) | Secret used to sign staff JWTs |
| `JWT_EXPIRES_IN` | `12h` | Staff token lifetime |
| `STAFF_AUTH` | `password` | How staff sign in: `password` (local email + password), `neon` (Neon Auth only) or `both` |
| `NEON_AUTH_JWKS_URL` | – | Neon console → Connect → Auth → JWKS URL. Required for `neon`/`both` |
| `NEON_AUTH_ISSUER` / `NEON_AUTH_AUDIENCE` | – | Optional extra checks on the Neon Auth JWT |
| `NEON_AUTH_REQUIRE_VERIFIED_EMAIL` | `true` | Only accept Neon Auth users with a verified email. Turn off only if Neon Auth sign-up is disabled |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed browser origins |
| `SWAGGER_ENABLED` | on, except when `APP_ENV=production` | Serve OpenAPI docs at `/docs` |
| `BODY_LIMIT_BYTES` | `65536` | Max request body size |
| `AVAILABILITY_CACHE_TTL_SECONDS` | `30` | Availability cache TTL |
| `BOOKING_LOCK_TTL_MS` | `5000` | Redis per-slot lock TTL while creating a booking |
| `RATE_LIMIT_ENABLED` | `true` | Toggle rate limiting on public routes |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` | `60` / `1 minute` | Public read limit per IP and tenant (writes and lookups get a third of it, minimum 10) |
| `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` | `owner@demo-arena.ph` / `demo-owner-123` | Owner account created by `pnpm seed` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `bookcourt` | docker-compose only |
| `POSTGRES_PORT` / `REDIS_PORT` / `API_PORT` | `5432` / `6379` / `4000` | docker-compose host ports |

Tests use `TEST_DATABASE_URL` (default `postgres://bookcourt:bookcourt@localhost:5432/bookcourt_test`,
created automatically) and `TEST_REDIS_URL` (default Redis DB 15).

### Production safety checks

With `APP_ENV=production` the API **refuses to start** if:
- `JWT_SECRET` looks like a placeholder
- `NODE_ENV` isn't `production`
- any `CORS_ORIGINS` entry isn't an exact `https://` origin

`pnpm seed` also refuses to create the sample venue in production with the default owner password.

Logs redact `Authorization` and cookie headers, passwords and customer contact details.

## Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)**. It covers the production Docker Compose stack (Caddy with automatic HTTPS), onboarding a venue, backups, updates and rollback, and a go-live checklist. CI (`.github/workflows/ci.yml`) runs typecheck, tests, build, migrations and a Docker build on every PR, and on pushes to `staging` and `main`.

## API

Every `/api/v1` route requires the `x-tenant-slug` header. Errors always look like
`{ "error": { "code": "SLOT_UNAVAILABLE", "message": "..." } }`.

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/health` | public | DB and Redis status |
| GET | `/api/v1/tenant` | public | Venue name, timezone, currency |
| GET | `/api/v1/courts?sport=` | public | Active courts. Staff can add `includeInactive=true` |
| GET | `/api/v1/courts/:id` | public | |
| GET | `/api/v1/courts/:id/availability?date=YYYY-MM-DD` | public | Hourly slots (cached for 30s) |
| POST | `/api/v1/bookings` | public, rate-limited | `{ courtId, date, startTime, hours(1-3), customerName, customerPhone, customerEmail }` |
| GET | `/api/v1/bookings/lookup?reference=&phone=` | public, rate-limited | Both must match |
| POST | `/api/v1/bookings/:id/cancel` | customer (`{ reference, phone }`) or staff token | Frees the slot |
| POST | `/api/v1/auth/login` | public, rate-limited | Email + password. Returns a JWT scoped to the tenant (`STAFF_AUTH=password|both`) |
| POST | `/api/v1/auth/neon` | public, rate-limited | `{ token }`: exchanges a Neon Auth JWT for the same staff session (`STAFF_AUTH=neon|both`) |
| GET | `/api/v1/auth/me` | staff | |
| POST | `/api/v1/courts` | owner | Create a court |
| PATCH | `/api/v1/courts/:id` | owner | Edit name, sport, price, hours or `isActive` |
| GET | `/api/v1/admin/bookings?date=&courtId=&status=` | staff | Bookings for a local date, with totals |
| POST | `/api/v1/admin/bookings` | staff | Walk-in booking (email optional) |

Full request and response schemas are at `/docs`.

## How double booking is prevented

1. **Postgres is the source of truth.** `bookings` has an exclusion constraint:
   ```sql
   EXCLUDE USING gist (court_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
     WHERE (status = 'confirmed')
   ```
   (`btree_gist` provides `=` for uuid inside GiST). Back-to-back bookings are allowed. Cancelled
   bookings don't block a slot.
2. **The error becomes a clean 409.** Postgres error `23P01` is turned into
   `409 SLOT_UNAVAILABLE`. The central error handler does the same as a backup.
3. **A Redis lock is the fast path.** `SET NX PX` on `lock:booking:{court}:{hour}` for every hour
   requested. Concurrent requests for the same slot fail fast without reaching the database. The
   lock is released with a compare-and-delete Lua script.
4. **The availability cache is invalidated.** `avail:{tenant}:{court}:{date}` is deleted whenever a
   booking is created or cancelled, or the court changes.

`tests/bookings.test.ts` fires 15 concurrent requests at one slot and asserts exactly one `201`.
It also covers overlaps the Redis lock can't see, and raw concurrent inserts, which must fail with `23P01`.

Other rules:
- **Price:** always `price_per_hour × hours` from the database. Anything the client sends is ignored.
- **Phone numbers:** normalised to E.164 (`0917 123 4567` → `+639171234567`), so lookups work however the number was typed.
- **Passwords:** hashed with argon2id. Login runs the same hash work for unknown emails, so response timing doesn't reveal which emails exist.

## Staff sign-in with Neon Auth

With `STAFF_AUTH=neon` (or `both`), staff sign in with **Neon Auth** (hosted Better Auth):
1. The web app's login handler signs in at Neon Auth (`/sign-in/email`) on the server and fetches a
   short-lived JWT (`/token`).
2. It sends that JWT to `POST /api/v1/auth/neon`.
3. The API verifies it against `NEON_AUTH_JWKS_URL`, then looks up a **pre-registered** staff record
   for this venue by email.
4. It returns the usual venue-scoped session.

Neon Auth only proves who someone is. Which venue they belong to and their role (owner or staff)
stay in this API's `users` table.

- **Add staff without a password:** `pnpm tenant:create --slug demo-arena --email desk@venue.ph --role staff`.
  The person creates a Neon Auth account with that email, or you add them in the Neon console.
- **Verified emails only, by default.** On first sign-in the staff record is pinned to that Neon Auth
  user id, so a different account that later registers the same email is refused.
- **Recommended:** turn off public sign-up in Neon Auth, so only invited staff have accounts.

## Multi-tenancy

- Every business table has `tenant_id`. `bookings → courts` uses a composite FK on `(tenant_id, court_id)`, so a booking can never point at another tenant's court.
- `plugins/tenant.ts` resolves the tenant from `x-tenant-slug` (cached in Redis for 60s). Every repository function takes `tenantId` and filters by it.
- Staff JWTs carry the tenant id (`tid`), and a token used against another tenant gets `403`.

## Folder structure

```
book-court-BE/
├── migrations/                 # plain SQL migrations (node-pg-migrate)
├── src/
│   ├── config/env.ts           # Zod-validated environment
│   ├── plugins/                # db, redis, tenant, auth (JWT), rate-limit, errors
│   ├── modules/
│   │   ├── auth/               # login, me
│   │   ├── availability/       # slots.ts (pure slot generation), cache + routes
│   │   ├── bookings/           # public + admin booking routes
│   │   ├── courts/             # public + admin court routes
│   │   ├── health/
│   │   └── tenants/
│   │       # each module: *.routes.ts, *.schemas.ts, *.service.ts, *.repository.ts
│   ├── scripts/                # seed.ts (sample venue), create-tenant.ts (onboard real venues)
│   ├── utils/                  # errors, time (timezone math), lock, phone, reference codes
│   ├── app.ts                  # buildApp() (used by server and tests)
│   └── server.ts
├── tests/                      # Vitest: slots.test.ts, bookings.test.ts
├── Dockerfile                  # multi-stage, non-root runtime
├── docker-compose.yml          # local stack: postgres, redis, api, web (ports published for dev)
├── docker-compose.prod.yml     # production stack: caddy (HTTPS) → web + api → postgres + redis
├── deploy/                     # Caddyfile, backup.sh
├── DEPLOYMENT.md               # how to run it in production
└── docker-entrypoint.sh        # runs migrations before starting
```

## Not in the demo (yet)

Search for `TODO(` to find where each of these would plug in:
- `TODO(payments)`: online payment (GCash / Maya via a PSP), holds and refunds
- `TODO(notifications)`: SMS and email confirmations and cancellations
- `TODO(policy)`: per-venue cancellation window
- `TODO(multi-tenant)`: tenant onboarding and resolving tenants by subdomain or custom domain
- Billing

## Branches

- `main`: production
- `staging`: testing. Feature branches open pull requests into `staging`.
