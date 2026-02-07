#!/bin/sh
set -e

echo "Applying database schema..."
npx prisma db push --skip-generate

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
