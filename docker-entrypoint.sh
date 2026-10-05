#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Running database migrations..."
  node dist/scripts/migrate.js
fi

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "Seeding demo data..."
  node dist/scripts/seed.js
fi

exec "$@"
