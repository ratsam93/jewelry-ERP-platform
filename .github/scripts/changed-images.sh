#!/usr/bin/env bash
# Reads changed file paths (one per line) on stdin and prints, space separated and in a
# fixed order, the images whose build inputs are among them.
#
#   git diff --no-renames --name-only OLD NEW | .github/scripts/changed-images.sh
#
# Inputs per image mirror what docker/<image>.Dockerfile COPYs (verified against the
# Dockerfiles and each package.json's workspace dependencies):
#   api        apps/api, packages/{db,shared-types,utils}, docker/api.Dockerfile,
#              docker/rewrite-workspace-pkgs.js
#   web        apps/web, packages/{ui,shared-types,utils}, docker/web.Dockerfile
#   storefront apps/storefront, docker/storefront.Dockerfile (no workspace deps)
#   website    apps/website, docker/website.Dockerfile, docker/nginx-website.conf (no workspace deps)
#   minio, mc  their own Dockerfile only
# Root manifests/config (lockfile, package.json, pnpm-workspace.yaml, turbo.json,
# tsconfig*.json, .dockerignore, .npmrc) affect api, web, storefront and website.
# If you add a workspace dependency or a COPY, update this file AND the test script.
set -euo pipefail

api=0 web=0 storefront=0 website=0 minio=0 mc=0
while IFS= read -r f || [ -n "$f" ]; do
  case "$f" in
    package.json|pnpm-lock.yaml|pnpm-workspace.yaml|turbo.json|tsconfig*.json|.dockerignore|.npmrc)
      api=1; web=1; storefront=1; website=1 ;;
    apps/api/*|packages/db/*|docker/api.Dockerfile|docker/rewrite-workspace-pkgs.js) api=1 ;;
    packages/shared-types/*|packages/utils/*) api=1; web=1 ;;
    apps/web/*|packages/ui/*|docker/web.Dockerfile) web=1 ;;
    apps/storefront/*|docker/storefront.Dockerfile) storefront=1 ;;
    apps/website/*|docker/website.Dockerfile|docker/nginx-website.conf) website=1 ;;
    docker/minio.Dockerfile) minio=1 ;;
    docker/mc.Dockerfile) mc=1 ;;
  esac
done

out=""
[ "$api" = 1 ] && out="$out api"
[ "$web" = 1 ] && out="$out web"
[ "$storefront" = 1 ] && out="$out storefront"
[ "$website" = 1 ] && out="$out website"
[ "$minio" = 1 ] && out="$out minio"
[ "$mc" = 1 ] && out="$out mc"
echo "${out# }"
