# Deploying Book Court PH

This guide runs the whole platform on **one Linux server with Docker**, using `docker-compose.prod.yml`:

```
Internet ──► Caddy :80/:443 (automatic HTTPS)
               ├── /api/v1/*, /health ──► api  (Fastify, migrations run on start)
               └── everything else   ──► web  (Next.js)
                                          api ──► postgres (data volume) + redis
```

Only Caddy publishes ports. Postgres, Redis, the API and the web app are reachable only on the
internal Docker network. The browser calls the API on the same domain, so there's no CORS setup
to get wrong.

A small VPS is enough for one venue (2 vCPU / 2 GB RAM / 25 GB disk; DigitalOcean SGP, Linode,
AWS Lightsail, Vultr Manila...).

---

## 1. One-time server setup

1. **Point DNS at the server.** Create an `A` record (and `AAAA` if you have IPv6), e.g.
   `book.your-venue.ph → <server IP>`. Wait until `dig +short book.your-venue.ph` returns the IP.
2. **Open the firewall** for ports 80 and 443 (TCP) and 443/UDP. Keep 22 for SSH. Nothing else.
3. **Install Docker** (Engine + Compose plugin): https://docs.docker.com/engine/install/
4. **Check out both repos side by side.** The web image is built from `../book-court-FE`:
   ```bash
   sudo mkdir -p /srv && cd /srv
   git clone -b main https://github.com/rlfmng/book-court-BE.git
   git clone -b main https://github.com/rlfmng/book-court-FE.git
   cd book-court-BE
   ```
5. **Create the production env file:**
   ```bash
   cp .env.production.example .env.production
   chmod 600 .env.production
   # fill in SITE_DOMAIN, ACME_EMAIL, TENANT_SLUG, POSTGRES_PASSWORD and JWT_SECRET:
   openssl rand -base64 32   # POSTGRES_PASSWORD
   openssl rand -base64 48   # JWT_SECRET
   ```
   The API refuses to start if `JWT_SECRET` is a placeholder or the origin isn't `https://`.

## 2. Start it

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production ps     # all "healthy"
curl https://book.your-venue.ph/health                                        # {"status":"ok",...}
```

Caddy requests the TLS certificate on first start. Watch it with `... logs -f caddy`.

## 3. Onboard the venue

Use a shell alias to keep the commands short:
```bash
alias dc='docker compose -f docker-compose.prod.yml --env-file .env.production'
```

**A real client:** create the venue and its owner account, then set `TENANT_SLUG` in
`.env.production` to the same slug and rebuild the web image:

```bash
dc exec -e TENANT_USER_PASSWORD='<owner password, 10+ chars>' api \
  node dist/scripts/create-tenant.js --slug acme-courts --name "Acme Courts" --email owner@acme.ph
dc up -d --build web
```

Add front-desk staff later with `--email desk@acme.ph --role staff` (no `--name` needed).

Then, in the web app repo:
- Add the venue's real address, phone, socials, amenities and FAQ in `src/content/venue.ts`.
- Set `isSample: false` to remove the "Sample venue" banner.
- Rebuild `web`.

The owner logs in at `https://<domain>/admin/login` and adds courts, prices and hours under **Courts**.

**The sample venue (no client yet, for demos):**
```bash
dc exec -e SEED_OWNER_PASSWORD='<a real password>' api node dist/scripts/seed.js
```

## 4. Backups

```bash
./deploy/backup.sh                          # writes backups/bookcourt-<timestamp>.dump
crontab -e                                  # nightly at 03:15:
15 3 * * * cd /srv/book-court-BE && ./deploy/backup.sh >> backups/backup.log 2>&1
```

**Copy the dumps off the server** (S3, Backblaze B2, Google Drive). Test a restore at least once:

```bash
dc exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
  < backups/bookcourt-<timestamp>.dump
```

## 5. Updating

Releases flow `feature branch → staging (test) → main (production)`. On the server:

```bash
cd /srv/book-court-BE && git pull && cd ../book-court-FE && git pull && cd ../book-court-BE
./deploy/backup.sh                          # always back up before migrating
dc up -d --build                            # migrations run automatically when api starts
```

**Rollback:** check out the previous tag or commit in both repos and run `dc up -d --build` again.
Migrations are forward-only in production. If a release added a migration, restore the backup you
took before updating.

## 6. Monitoring

- **Uptime:** point an external monitor (UptimeRobot, Better Stack) at `https://<domain>/health`.
  It returns 503 if Postgres or Redis is down.
- **Logs:** `dc logs -f api web caddy`. Logs are JSON, rotated at 5 × 10 MB per container.
  Passwords, tokens, cookies and customer phone numbers and emails are redacted.
- **Disk:** keep an eye on `docker system df` and the `backups/` folder.

## Using Neon for the database (web app on Netlify)

This is the planned setup: **Neon** (Postgres, Singapore) + **the API container on a host that runs
Docker** + **the web app on Netlify** (see book-court-FE's README). The Compose stack above isn't
used: Neon replaces its `postgres` service, and Netlify replaces `web` and `caddy`.

**1. Neon project:** project `book-court-ph`, region **AWS Asia Pacific 1 (Singapore)**. From the
Neon console, Connect → copy two connection strings for the `production` branch:
- **Direct** (host `ep-….ap-southeast-1.aws.neon.tech`): use it for `DATABASE_URL`. The API is a
  long-running server with its own small pool (`DATABASE_POOL_MAX=10`), so it doesn't need Neon's
  pooler.
- (Optional) **Pooled** (host contains `-pooler`): only if you run many API instances. Then set
  `DATABASE_URL` to the pooled string, `DATABASE_STATEMENT_TIMEOUT_MS=0` (PgBouncer rejects that
  setting), and `MIGRATION_DATABASE_URL` to the direct string (migrations need a session).

Keep `?sslmode=require` in the URL. The API reads it and connects over TLS. `btree_gist` (the
double-booking guard) is supported on Neon, and the first migration creates it.

**2. Redis:** create an [Upstash](https://upstash.com) Redis database in Singapore and use its
`rediss://…` URL as `REDIS_URL`. It holds the availability cache, booking locks and rate limits.

**3. API host:** run this repo's Dockerfile on a container host (Render, Railway, Fly.io or a VPS)
in Singapore, with these environment variables:

| Variable | Value |
| --- | --- |
| `NODE_ENV` / `APP_ENV` | `production` / `production` |
| `DATABASE_URL` | Neon direct connection string |
| `REDIS_URL` | Upstash `rediss://` URL |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `CORS_ORIGINS` | the Netlify site, e.g. `https://bookcourt.ph,https://staging--bookcourt.netlify.app` |
| `TRUST_PROXY` | `1` (the host's load balancer is one hop) |

The container runs migrations on start (`RUN_MIGRATIONS=true` is the default), then starts the API
on port 4000. Health check path: `/health`.

**4. Data:** run the onboarding scripts once against Neon, either from the host's shell
(`node dist/scripts/create-tenant.js …`, `node dist/scripts/seed.js`) or from your laptop with
`DATABASE_URL` set to the Neon URL (`pnpm migrate`, `pnpm tenant:create …`).

**Neon notes:**
- **Backups:** Neon keeps point-in-time history (restore window depends on the plan) and lets you
  branch from any point. Before risky changes, create a branch as a snapshot. `deploy/backup.sh` is
  only for the self-hosted Compose stack.
- **Scale to zero:** on the free plan the compute sleeps after a few idle minutes, and the first
  request wakes it (about a second). An uptime monitor hitting `/health` keeps it awake but uses
  compute hours.
- **Preview data:** a Neon branch per environment (for example `staging`) gives the staging API its
  own copy of the data.
- **Row Level Security:** it's enabled on every table (migration `1759500000000_enable-rls`), so
  Neon's optional Data API can't read the tables. The API is unaffected, because it connects as the
  tables' owner.

## Go-live checklist

- [ ] DNS resolves to the server, and ports 80 and 443 are open
- [ ] `.env.production` filled in with fresh secrets, `chmod 600`, and not committed
- [ ] `dc ps` shows every service healthy, and `https://<domain>/health` returns `ok`
- [ ] Venue created with `create-tenant`, `TENANT_SLUG` set, and the web image rebuilt
- [ ] `src/content/venue.ts` has the real contacts and `isSample: false` (or keep the sample banner for demos)
- [ ] Owner can log in, courts and prices are set, and a test booking can be made and cancelled
- [ ] Backups: the nightly cron plus an off-server copy (Compose stack), or Neon's restore window checked (Neon)
- [ ] Uptime monitor on `/health`
- [ ] GitHub: branch protection on `main` and `staging` (require PR and green CI)

## Known limits

Not done yet: online payments, SMS and email notifications, self-serve venue signup, and billing.
See the `TODO(...)` markers in the code. One server means a single point of failure; for more
venues or traffic, move Postgres to a managed service (`DATABASE_SSL=verify`) and run several API
and web containers behind a load balancer.
