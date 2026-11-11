# syntax=docker/dockerfile:1.7

# One image, one port, one volume. The worker (scheduler, jobs, migrations) and the Next.js app
# run side by side under docker/supervisor.mjs and share the SQLite database in /config.

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@11.10.0
WORKDIR /app

# ------------------------------------------------------------------------------ build
FROM base AS build
# Toolchain for better-sqlite3 when no prebuilt binary matches the platform.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @playbill/worker build && pnpm --filter @playbill/web build
# Production node_modules for the worker bundle (only better-sqlite3 is external).
RUN pnpm --filter @playbill/worker deploy --prod --legacy /out/worker \
  && cp -r apps/worker/dist /out/worker/dist

# ------------------------------------------------------------------------------ runtime
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG APP_VERSION=
ARG APP_REVISION=dev
LABEL org.opencontainers.image.title="Playbill" \
      org.opencontainers.image.description="Newsletters, new-arrival alerts and user management for Plex server owners" \
      org.opencontainers.image.source="https://github.com/ahamedzoha/playbill" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${APP_REVISION}"
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NO_COLOR=1 \
    APP_VERSION=${APP_VERSION} \
    APP_REVISION=${APP_REVISION} \
    CONFIG_DIR=/config \
    PORT=5056 \
    HOSTNAME=0.0.0.0 \
    PUID=1000 \
    PGID=1000 \
    TZ=UTC

WORKDIR /app
COPY --from=build /out/worker ./worker
COPY --from=build /app/apps/web/.next/standalone ./web
COPY --from=build /app/apps/web/.next/static ./web/apps/web/.next/static
COPY docker/entrypoint.sh docker/supervisor.mjs ./
RUN chmod +x entrypoint.sh && mkdir -p /config && chown node:node /config

VOLUME /config
EXPOSE 5056
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/app/entrypoint.sh"]
