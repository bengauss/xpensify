# syntax=docker/dockerfile:1.7
# Stage 1: Build client
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --prefer-offline --no-audit --no-fund
# Install server deps FIRST (package.json only), then copy server src.
# Ordering matters: native-module install (python3 + make + g++ + better-sqlite3)
# is expensive (~10s) and should stay cached across server source changes.
COPY server/package.json server/package-lock.json* /app/server/
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    apk add --no-cache python3 make g++ \
 && cd /app/server \
 && npm ci --prefer-offline --no-audit --no-fund
COPY server/src/ /app/server/src/
# Now copy client source (changes frequently, but everything above is cached)
COPY client/ ./
# VITE_* env vars must be present at build time for import.meta.env
ARG VITE_VAPID_PUBLIC_KEY
ENV VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY
ARG VITE_APPLE_SHORTCUT_URL
ENV VITE_APPLE_SHORTCUT_URL=$VITE_APPLE_SHORTCUT_URL
RUN npm run build

# Stage 2: Build server
FROM node:22-alpine AS server-build
WORKDIR /app/server
RUN apk add --no-cache python3 make g++
COPY server/package.json server/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --prefer-offline --no-audit --no-fund
COPY server/ ./
RUN npm run build

# Stage 3: Runtime — reuse server-build's node_modules, prune dev deps
FROM node:22-alpine
WORKDIR /app

# Copy full server node_modules from build stage, then prune dev deps.
# Avoids a second `npm ci --omit=dev` that would re-download everything.
COPY server/package.json server/package-lock.json* ./server/
COPY --from=server-build /app/server/node_modules ./server/node_modules
RUN cd server && npm prune --omit=dev

COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/server/src/db/schema.sql ./server/dist/db/
COPY --from=client-build /app/client/dist ./client/dist

# Categories + users YAML configs. The seeder resolves them from
# process.cwd() (`/app`) → `config/...`, so this path matches what
# loadCategoriesConfig / loadUsersConfig search for.
COPY config/ /app/config/

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/xpensify.db

EXPOSE 3000
CMD ["node", "server/dist/index.js"]
