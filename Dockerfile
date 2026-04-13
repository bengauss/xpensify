# Stage 1: Build client
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm ci
# Install server deps for type-only imports (@server/* path alias) BEFORE copying
# client source — these layers rarely change and are expensive (~10s).
COPY server/package.json server/package-lock.json* /app/server/
COPY server/src/ /app/server/src/
RUN apk add --no-cache python3 make g++ && cd /app/server && npm ci
# Now copy client source (changes frequently, but everything above is cached)
COPY client/ ./
# VITE_* env vars must be present at build time for import.meta.env
ARG VITE_VAPID_PUBLIC_KEY
ENV VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY
RUN npm run build

# Stage 2: Build server
FROM node:22-alpine AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm ci
COPY server/ ./
RUN npm run build

# Stage 3: Runtime
FROM node:22-alpine
WORKDIR /app

COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev

COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/server/src/db/*.sql ./server/dist/db/
COPY --from=client-build /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/xpensify.db

EXPOSE 3000
CMD ["node", "server/dist/index.js"]
