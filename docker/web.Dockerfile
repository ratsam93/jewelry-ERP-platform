# syntax=docker/dockerfile:1.7
#
# CaratFlow admin web app (Next.js 15, basePath /admin) as a standalone server.
#
# NEXT_PUBLIC_* values are inlined at BUILD time, so they are build args here
# (supplied from GitHub repository variables by the deploy workflow).
#
# Build (from the repo root):
#   docker build -f docker/web.Dockerfile -t caratflow-web \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com .

ARG NODE_VERSION=22
ARG PNPM_VERSION=9.15.0

FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat \
    && corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/utils/package.json packages/utils/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@caratflow/web..."

FROM deps AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_DEMO_MODE=false
ARG NEXT_PUBLIC_TENANT_SLUG=
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_DEMO_MODE=${NEXT_PUBLIC_DEMO_MODE} \
    NEXT_PUBLIC_TENANT_SLUG=${NEXT_PUBLIC_TENANT_SLUG} \
    NEXT_OUTPUT=standalone \
    NODE_ENV=production
COPY tsconfig.json ./
COPY packages/ui packages/ui
COPY packages/shared-types packages/shared-types
COPY packages/utils packages/utils
COPY apps/web apps/web
RUN --mount=type=cache,id=next-cache-web,target=/repo/apps/web/.next/cache \
    pnpm --filter @caratflow/web build

FROM node:${NODE_VERSION}-alpine AS runtime
ARG GIT_SHA=unknown
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    GIT_SHA=${GIT_SHA}
LABEL org.opencontainers.image.title="caratflow-web" \
      org.opencontainers.image.revision=${GIT_SHA}
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/admin').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
