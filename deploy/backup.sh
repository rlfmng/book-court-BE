#!/bin/sh
# Nightly Postgres backup for the production stack. Keeps the last $KEEP_DAYS days.
#   crontab:  15 3 * * *  cd /srv/book-court-BE && ./deploy/backup.sh >> backups/backup.log 2>&1
set -eu

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
# shellcheck disable=SC2016
$COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > "$BACKUP_DIR/bookcourt-$STAMP.dump"
find "$BACKUP_DIR" -name 'bookcourt-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: $BACKUP_DIR/bookcourt-$STAMP.dump"

# TODO(ops): copy the dump off the server (S3, Backblaze B2, Google Drive...). A backup on the same disk is not a backup.
