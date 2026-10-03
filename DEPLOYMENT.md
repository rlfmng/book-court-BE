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

## Go-live checklist

- [ ] DNS resolves to the server, and ports 80 and 443 are open
- [ ] `.env.production` filled in with fresh secrets, `chmod 600`, and not committed
- [ ] `dc ps` shows every service healthy, and `https://<domain>/health` returns `ok`
- [ ] Venue created with `create-tenant`, `TENANT_SLUG` set, and the web image rebuilt
- [ ] `src/content/venue.ts` has the real contacts and `isSample: false` (or keep the sample banner for demos)
- [ ] Owner can log in, courts and prices are set, and a test booking can be made and cancelled
- [ ] Nightly backup cron is installed, a copy goes off the server, and a restore has been tested
- [ ] Uptime monitor on `/health`
- [ ] GitHub: branch protection on `main` and `staging` (require PR and green CI)

## Known limits

Not done yet: online payments, SMS and email notifications, self-serve venue signup, and billing.
See the `TODO(...)` markers in the code. One server means a single point of failure; for more
venues or traffic, move Postgres to a managed service (`DATABASE_SSL=verify`) and run several API
and web containers behind a load balancer.
