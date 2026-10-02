#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Running database migrations..."
  ./node_modules/.bin/node-pg-migrate -m migrations -d DATABASE_URL --no-verbose up
fi

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "Seeding demo data..."
  node dist/scripts/seed.js
fi

exec "$@"
