# syntax=docker/dockerfile:1.7
#
# CaratFlow customer storefront (Next.js 15) as a standalone server.
# NEXT_PUBLIC_* values are inlined at BUILD time (build args).
#
#   docker build -f docker/storefront.Dockerfile -t caratflow-storefront \
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
COPY apps/storefront/package.json apps/storefront/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@caratflow/storefront..."

FROM deps AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_TENANT_ID=69544f8e-fa3c-40b4-8975-643825600ce7
ARG NEXT_PUBLIC_TENANT_SLUG=sharma-jewellers
ARG NEXT_PUBLIC_IMAGE_HOSTS=
ARG NEXT_PUBLIC_DEMO_MODE=false
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_TENANT_ID=${NEXT_PUBLIC_TENANT_ID} \
    NEXT_PUBLIC_TENANT_SLUG=${NEXT_PUBLIC_TENANT_SLUG} \
    NEXT_PUBLIC_IMAGE_HOSTS=${NEXT_PUBLIC_IMAGE_HOSTS} \
    NEXT_PUBLIC_DEMO_MODE=${NEXT_PUBLIC_DEMO_MODE} \
    NEXT_OUTPUT=standalone \
    NODE_ENV=production
COPY tsconfig.json ./
COPY apps/storefront apps/storefront
RUN --mount=type=cache,id=next-cache-storefront,target=/repo/apps/storefront/.next/cache \
    pnpm --filter @caratflow/storefront build

FROM node:${NODE_VERSION}-alpine AS runtime
ARG GIT_SHA=unknown
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3003 \
    HOSTNAME=0.0.0.0 \
    GIT_SHA=${GIT_SHA}
LABEL org.opencontainers.image.title="caratflow-storefront" \
      org.opencontainers.image.revision=${GIT_SHA}
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/storefront/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/storefront/.next/static ./apps/storefront/.next/static
USER node
EXPOSE 3003
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3003/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/storefront/server.js"]
