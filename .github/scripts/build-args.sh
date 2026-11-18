#!/usr/bin/env bash
# Prints the Docker build arguments (one KEY=VALUE per line) that are baked into an image.
# GIT_SHA is deliberately NOT included: it changes on every commit. The sha256 of this
# output is stored on the image as the label cf.build-args-hash, so a change of the
# repository variables (DOMAIN, TENANT_ID, TENANT_SLUG, NEXT_PUBLIC_IMAGE_HOSTS) makes
# the affected images rebuild instead of being re-tagged.
#
#   DOMAIN=example.com .github/scripts/build-args.sh web
#
# Env: DOMAIN (required for web/storefront/website), TENANT_ID, TENANT_SLUG, IMAGE_HOSTS
set -euo pipefail

image="${1:?usage: build-args.sh <api|web|storefront|website|minio|mc>}"
tenant_id="${TENANT_ID:-69544f8e-fa3c-40b4-8975-643825600ce7}"
tenant_slug="${TENANT_SLUG:-sharma-jewellers}"

case "$image" in
  web)
    echo "NEXT_PUBLIC_API_URL=https://api.${DOMAIN:?DOMAIN is required}"
    echo "NEXT_PUBLIC_TENANT_SLUG=${TENANT_SLUG:-}"
    ;;
  storefront)
    echo "NEXT_PUBLIC_API_URL=https://api.${DOMAIN:?DOMAIN is required}"
    echo "NEXT_PUBLIC_TENANT_ID=$tenant_id"
    echo "NEXT_PUBLIC_TENANT_SLUG=$tenant_slug"
    echo "NEXT_PUBLIC_IMAGE_HOSTS=${IMAGE_HOSTS:-}"
    ;;
  website)
    echo "NEXT_PUBLIC_API_URL=https://api.${DOMAIN:?DOMAIN is required}"
    echo "NEXT_PUBLIC_TENANT_ID=$tenant_id"
    echo "NEXT_PUBLIC_SITE_URL=https://${DOMAIN}"
    ;;
  api|minio|mc) ;;
  *) echo "unknown image: $image" >&2; exit 2 ;;
esac
