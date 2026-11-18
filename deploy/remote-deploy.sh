#!/usr/bin/env bash
# Runs ON THE SERVER (copied and invoked by .github/workflows/deploy.yml, or by hand).
#
#   echo "$TOKEN" | GHCR_USER=me ./remote-deploy.sh <image-tag> [run_seed=true|false]
#
# - reads a GHCR token from stdin (never from argv), logs in, and logs out again on exit
# - pulls the images, applies the DB schema (migrate one-shot), starts/updates the stack
# - waits for health; on failure rolls back to the previous good tag (.last_good_tag)
# - on success records the tag in .last_good_tag
set -euo pipefail

TAG="${1:?usage: remote-deploy.sh <image-tag> [run_seed]}"
RUN_SEED="${2:-false}"
APP_DIR="${APP_DIR:-/opt/caratflow}"
GHCR_USER="${GHCR_USER:-}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-300}"

cd "$APP_DIR"
[ -f .env ] || { echo "missing $APP_DIR/.env (see docs/DEPLOYMENT-DOCKER.md)" >&2; exit 1; }
# shellcheck disable=SC1091
DOMAIN="$(grep -E '^DOMAIN=' .env | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
[ -n "$DOMAIN" ] || { echo "DOMAIN is not set in .env" >&2; exit 1; }

compose() { docker compose -f docker-compose.prod.yml --env-file .env "$@"; }

set_tag() {
  if grep -qE '^IMAGE_TAG=' .env; then
    sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$1|" .env
  else
    printf '\nIMAGE_TAG=%s\n' "$1" >> .env
  fi
}

if [ -n "$GHCR_USER" ] && IFS= read -r -t 5 TOKEN && [ -n "${TOKEN:-}" ]; then
  trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
  printf '%s' "$TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
  unset TOKEN
  echo "logged in to ghcr.io"
fi

PREV="$(cat .last_good_tag 2>/dev/null || true)"
echo "previous good tag: ${PREV:-none}; deploying: $TAG"

wait_healthy() {
  local deadline=$(( $(date +%s) + HEALTH_TIMEOUT )) svc cid status all
  while [ "$(date +%s)" -lt "$deadline" ]; do
    all=true
    for svc in mysql redis minio api web storefront website caddy; do
      cid="$(compose ps -q "$svc" 2>/dev/null || true)"
      if [ -z "$cid" ]; then all=false; continue; fi
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid")"
      case "$status" in healthy|running) ;; *) all=false ;; esac
    done
    if $all && curl -fsS --max-time 10 "https://api.${DOMAIN}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 5
  done
  return 1
}

# Caddyfile is a bind mount, so `up -d` never restarts Caddy when only the file changed.
# Validate the new config inside the running container, then reload it gracefully. If the
# config is invalid the old config keeps serving and the deploy fails with a clear message.
reload_caddy() {
  local cid
  cid="$(compose ps -q caddy 2>/dev/null || true)"
  if [ -z "$cid" ] || [ "$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null || echo false)" != "true" ]; then
    echo "caddy is not running; skipping config reload"
    return 0
  fi
  if ! compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    echo "!! deploy/Caddyfile failed 'caddy validate'; the previous Caddy config is still active" >&2
    compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile >&2 || true
    return 1
  fi
  compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
  echo "caddy config reloaded"
}

rollback() {
  echo "!! deployment of $TAG failed" >&2
  compose ps || true
  compose logs --tail=60 api migrate 2>/dev/null || true
  if [ -n "$PREV" ] && [ "$PREV" != "$TAG" ]; then
    echo "rolling back to $PREV" >&2
    set_tag "$PREV"
    compose pull --quiet || true
    compose up -d --remove-orphans || true
    if wait_healthy; then
      echo "rollback to $PREV succeeded (the schema is NOT rolled back; see docs/DEPLOYMENT-DOCKER.md)" >&2
    else
      echo "!! rollback to $PREV is not healthy either: check 'docker compose logs'" >&2
    fi
  else
    echo "no previous good tag to roll back to" >&2
  fi
  exit 1
}

set_tag "$TAG"
compose pull --quiet

# Infrastructure first, then the schema, so a failing migration never touches the running apps.
compose up -d mysql redis minio
if ! compose run --rm migrate; then
  echo "!! schema migration failed; running apps were not changed" >&2
  set_tag "${PREV:-$TAG}"
  exit 1
fi

if [ "$RUN_SEED" = "true" ]; then
  echo "running demo seed (first install only: seed.ts is not re-runnable)"
  compose --profile tools run --rm seed-demo || { echo "!! seed failed" >&2; rollback; }
fi

compose up -d --remove-orphans || rollback
if ! reload_caddy; then
  echo "!! deployment of $TAG failed: Caddy config invalid or reload failed (old config kept running)" >&2
  rollback
fi
wait_healthy || rollback

echo "$TAG" > .last_good_tag
docker image prune -f >/dev/null 2>&1 || true
echo "deployed $TAG successfully"
compose ps
