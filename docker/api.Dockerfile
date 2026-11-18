# syntax=docker/dockerfile:1.7
#
# CaratFlow API (NestJS + Prisma + tRPC + BullMQ).
#
# The workspace packages (@caratflow/db, shared-types, utils) export TypeScript
# from src/, which plain `node` cannot load. Instead of shipping a TS loader at
# runtime, this image compiles them to CommonJS (their tsconfig.build.json) and
# rewrites their package.json entry points to dist/ inside the image only, so the
# API starts with a plain `node dist/main.js`.
#
# The same image also carries the Prisma CLI + tsx under /opt/tools, used by the
# one-shot `migrate`, `seed` and `bootstrap-tenant` compose services.
#
# Build (from the repo root):
#   docker build -f docker/api.Dockerfile -t caratflow-api .

ARG NODE_VERSION=22
ARG PNPM_VERSION=9.15.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
# OpenSSL is required by the Prisma query engine on Debian slim.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# 1. Install dependencies (cached while manifests/lockfile are unchanged)
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/utils/package.json packages/utils/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@caratflow/api..."

# 2. Compile
FROM deps AS build
COPY tsconfig.json ./
COPY packages/db packages/db
COPY packages/shared-types packages/shared-types
COPY packages/utils packages/utils
COPY apps/api apps/api
RUN pnpm --filter @caratflow/db exec prisma generate
RUN pnpm --filter @caratflow/shared-types build \
    && pnpm --filter @caratflow/utils build \
    && pnpm --filter @caratflow/db build
RUN pnpm --filter @caratflow/api build
# Production-only dependency tree for the API (workspace packages are copied in).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @caratflow/api deploy --prod --store-dir /pnpm/store /out
# `pnpm deploy` already includes the compiled dist/ of the workspace packages. Point
# each of them at dist/ instead of src/*.ts (image-only change; fails if dist is missing).
COPY docker/rewrite-workspace-pkgs.js /tmp/rewrite-workspace-pkgs.js
RUN node /tmp/rewrite-workspace-pkgs.js /out/node_modules/@caratflow
# Generate the Prisma client against the deployed (production) dependency tree.
RUN cd /out/node_modules/@caratflow/db \
    && /repo/packages/db/node_modules/.bin/prisma generate --schema prisma/schema

# 3. Operational tools (Prisma CLI for `db push`, tsx for the seed scripts)
#    The seed scripts (src/seed-demo-catalog.ts, src/seed-demo-full.ts, src/rebrand-text.ts and src/demo-full/*)
#    ship with the whole @caratflow/db package copied by `pnpm deploy` above.
FROM base AS tools
ARG PRISMA_VERSION=6.19.3
RUN --mount=type=cache,id=npm-cache,target=/root/.npm \
    mkdir /opt/tools && cd /opt/tools \
    && npm init -y >/dev/null \
    && npm install --omit=dev --no-audit --no-fund prisma@${PRISMA_VERSION} tsx@4 uuid@11

# 4. Runtime
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG GIT_SHA=unknown
ENV NODE_ENV=production \
    API_PORT=4000 \
    GIT_SHA=${GIT_SHA} \
    NODE_PATH=/opt/tools/node_modules
LABEL org.opencontainers.image.title="caratflow-api" \
      org.opencontainers.image.revision=${GIT_SHA}
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /out /app
COPY --from=build --chown=node:node /repo/apps/api/dist /app/dist
COPY --from=tools --chown=node:node /opt/tools /opt/tools
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
