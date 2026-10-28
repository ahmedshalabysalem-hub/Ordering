# Production image (DOC-002). One Node process serves pages, APIs and the live SSE streams (ADR-005,
# ADR-014). Migrations run on start; the first admin is created once with `pnpm admin:bootstrap`.
FROM node:22-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1 COREPACK_HOME=/opt/corepack
RUN corepack enable && mkdir -p /opt/corepack && chmod 777 /opt/corepack
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack install && pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Placeholders only so the build can load its config; real values are given at run time.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-time-placeholder-not-a-secret-000 \
    pnpm build

FROM base AS run
ENV NODE_ENV=production PORT=3000 UPLOAD_DIR=/app/storage/uploads
# Dev dependencies stay in the image: migrations (drizzle-kit) and the admin bootstrap (tsx) need them.
COPY --from=deps /opt/corepack /opt/corepack
COPY --from=build --chown=node:node /app ./
RUN mkdir -p /app/storage/uploads && chown -R node:node /app/storage /opt/corepack
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["sh", "-c", "pnpm db:migrate && exec pnpm start --hostname 0.0.0.0 --port ${PORT}"]
