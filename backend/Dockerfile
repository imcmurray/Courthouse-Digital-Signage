# ---- Dependencies ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build ----
FROM deps AS build
COPY . .
RUN npx prisma generate
RUN npx tsc
# Copy OpenAPI spec to dist
RUN cp src/openapi.yaml dist/ 2>/dev/null || true
# Compile seed script separately (outside src/ rootDir)
RUN npx tsc --esModuleInterop --skipLibCheck --module commonjs --target ES2022 \
    --outDir dist-seed prisma/seed.ts

# ---- Runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy Prisma schema and generate client for production
COPY prisma/schema.prisma prisma/
RUN npx prisma generate

# Copy built application
COPY --from=build /app/dist ./dist
# Copy compiled seed script
COPY --from=build /app/dist-seed/prisma/seed.js ./dist/seed.js

# Copy entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create data and uploads directories
RUN mkdir -p /app/data /app/uploads

ENV NODE_ENV=production
ENV DATABASE_URL=file:/app/data/prod.db
ENV UPLOADS_DIR=/app/uploads

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
