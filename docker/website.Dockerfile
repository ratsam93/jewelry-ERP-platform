# syntax=docker/dockerfile:1.7
#
# CaratFlow marketing website: Next.js static export (apps/website/out) served by
# an unprivileged nginx. NEXT_PUBLIC_* values are inlined at BUILD time.
#
#   docker build -f docker/website.Dockerfile -t caratflow-website \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://example.com .

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
COPY apps/website/package.json apps/website/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@caratflow/website..."

FROM deps AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_TENANT_ID=69544f8e-fa3c-40b4-8975-643825600ce7
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3002
ARG NEXT_PUBLIC_SOCIAL_X=
ARG NEXT_PUBLIC_SOCIAL_LINKEDIN=
ARG NEXT_PUBLIC_SOCIAL_FACEBOOK=
ARG NEXT_PUBLIC_SOCIAL_YOUTUBE=
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_TENANT_ID=${NEXT_PUBLIC_TENANT_ID} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_SOCIAL_X=${NEXT_PUBLIC_SOCIAL_X} \
    NEXT_PUBLIC_SOCIAL_LINKEDIN=${NEXT_PUBLIC_SOCIAL_LINKEDIN} \
    NEXT_PUBLIC_SOCIAL_FACEBOOK=${NEXT_PUBLIC_SOCIAL_FACEBOOK} \
    NEXT_PUBLIC_SOCIAL_YOUTUBE=${NEXT_PUBLIC_SOCIAL_YOUTUBE} \
    NODE_ENV=production
COPY tsconfig.json ./
COPY apps/website apps/website
RUN --mount=type=cache,id=next-cache-website,target=/repo/apps/website/.next/cache \
    pnpm --filter @caratflow/website build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="caratflow-website" \
      org.opencontainers.image.revision=${GIT_SHA}
COPY docker/nginx-website.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/website/out /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
