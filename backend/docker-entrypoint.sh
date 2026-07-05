#!/bin/sh
set -e

# Baseline databases that predate migration history: schema was originally applied
# with `prisma db push`, so they have tables but no _prisma_migrations table. Mark
# the init migration as already-applied so `migrate deploy` treats them as up to
# date instead of trying to recreate existing tables. This is a no-op on a fresh
# database (no `users` table yet) and on already-migrated databases.
NEEDS_BASELINE=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const has = async (name) => (await p.\$queryRawUnsafe(
    \"SELECT name FROM sqlite_master WHERE type='table' AND name=?\", name)).length > 0;
  try {
    const hasData = await has('users');
    const hasHistory = await has('_prisma_migrations');
    console.log(hasData && !hasHistory ? 'yes' : 'no');
  } catch (e) {
    console.log('no');
  } finally {
    await p.\$disconnect();
  }
})();
")

if [ "$NEEDS_BASELINE" = "yes" ]; then
  echo "Existing pre-migration database detected; baselining migration history..."
  npx prisma migrate resolve --applied 0_init
fi

echo "Applying database migrations..."
npx prisma migrate deploy

# Seed if no users exist
USER_COUNT=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.count().then(c => { console.log(c); p.\$disconnect(); });
")

if [ "$USER_COUNT" = "0" ]; then
  echo "No users found, running seed..."
  node dist/seed.js
else
  echo "Database already seeded ($USER_COUNT users found)"
fi

echo "Starting server..."
exec node dist/index.js
