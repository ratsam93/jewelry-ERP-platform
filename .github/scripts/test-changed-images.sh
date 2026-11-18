#!/usr/bin/env bash
# Unit-style test for the deploy change detection. Not wired into CI; run by hand:
#   bash .github/scripts/test-changed-images.sh
# 1) synthetic file lists -> expected images (pure, no git needed)
# 2) plan-images.sh end to end against a stubbed `docker` (no registry needed)
# 3) (informational) what the last few real commits of this repo would rebuild
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fail=0

check() { # name, expected, files...
  local name="$1" expected="$2"; shift 2
  local got; got="$(printf '%s\n' "$@" | bash "$here/changed-images.sh")"
  if [ "$got" = "$expected" ]; then echo "PASS $name -> [$got]"
  else echo "FAIL $name: expected [$expected] got [$got]"; fail=1; fi
}

check "docs only"            ""                          docs/DEPLOYMENT-DOCKER.md README.md
check "nothing"              ""
check "api source"           "api"                       apps/api/src/main.ts
check "web source"           "web"                       apps/web/app/page.tsx
check "storefront source"    "storefront"                apps/storefront/app/page.tsx
check "website text"         "website"                   apps/website/app/page.tsx
check "db package"           "api"                       packages/db/prisma/schema/core.prisma
check "ui package"           "web"                       packages/ui/src/button.tsx
check "shared-types"         "api web"                   packages/shared-types/src/events.ts
check "utils"                "api web"                   packages/utils/src/money.ts
check "lockfile"             "api web storefront website" pnpm-lock.yaml
check "root tsconfig"        "api web storefront website" tsconfig.json
check "api Dockerfile"       "api"                       docker/api.Dockerfile
check "rewrite script"       "api"                       docker/rewrite-workspace-pkgs.js
check "nginx conf"           "website"                   docker/nginx-website.conf
check "minio Dockerfile"     "minio"                     docker/minio.Dockerfile
check "mc Dockerfile"        "mc"                        docker/mc.Dockerfile
check "workflow/deploy only" ""                          .github/workflows/deploy.yml deploy/remote-deploy.sh
check "api + website"        "api website"               apps/website/x.tsx apps/api/y.ts
check "tests dir"            ""                          tests/e2e/a.spec.ts

# ---- plan-images.sh with a stubbed docker -------------------------------------------
# The stub answers `docker buildx imagetools inspect <ref> --format <fmt>`: every image
# has a :latest built from $STUB_BASE with the CORRECT hash label, except mc (no :latest).
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/docker" <<'STUB'
#!/usr/bin/env bash
ref="$4"; fmt="$6"
name="${ref##*caratflow-}"; name="${name%%:*}"
[ "$name" = "mc" ] && exit 1
case "$fmt" in
  *Manifest*) echo '{"digest":"sha256:abc123"}' ;;
  *Image*)
    h="$(bash "$STUB_SCRIPTS/build-args.sh" "$name" | sha256sum | cut -d' ' -f1)"
    [ -n "${STUB_BAD_HASH:-}" ] && [ "$name" = "$STUB_BAD_HASH" ] && h="stale"
    echo "{\"linux/amd64\":{\"config\":{\"Labels\":{\"org.opencontainers.image.revision\":\"$STUB_BASE\",\"cf.build-args-hash\":\"$h\"}}}}" ;;
esac
STUB
chmod +x "$tmp/docker"

plan() { # base head [rebuild_all] -> prints "build=... retag-images=..."
  local out="$tmp/out.$RANDOM"; : > "$out"
  PATH="$tmp:$PATH" STUB_SCRIPTS="$here" STUB_BASE="$1" REGISTRY=ghcr.io OWNER=acme SHA="$2"     REBUILD_ALL="${3:-false}" DOMAIN=example.com GITHUB_OUTPUT="$out"     bash "$here/plan-images.sh" 2>/dev/null || { echo "plan-images failed"; return 1; }
  local b r
  b="$(sed -n 's/^build_images=//p' "$out")"
  r="$(sed -n 's/^retag=//p' "$out" | grep -o '"image":"[a-z]*"' | cut -d'"' -f4 | tr '\n' ' ')"
  echo "build=$b retag=[${r% }]"
}
expect_plan() { # name expected base head [rebuild_all]
  local got; got="$(plan "$3" "$4" "${5:-false}")"
  if [ "$got" = "$2" ]; then echo "PASS plan $1 -> $got"; else echo "FAIL plan $1: expected [$2] got [$got]"; fail=1; fi
}

head_sha="$(git rev-parse HEAD)"
# Same commit: nothing changed, everything except mc (no :latest) is re-tagged.
expect_plan "same commit"  'build=["mc"] retag=[api web storefront website minio]' "$head_sha" "$head_sha"
expect_plan "rebuild_all"  'build=["api","web","storefront","website","minio","mc"] retag=[]' "$head_sha" "$head_sha" true
expect_plan "unknown base" 'build=["api","web","storefront","website","minio","mc"] retag=[]' "0000000000000000000000000000000000000000" "$head_sha"
STUB_BAD_HASH=web expect_plan "vars changed (web)" 'build=["web","mc"] retag=[api storefront website minio]' "$head_sha" "$head_sha"

# ---- real history (informational) -----------------------------------------------------
echo
echo "Real commits in this repository (what each would rebuild if :latest were its parent):"
for c in $(git log --format=%H -n 8 --no-merges); do
  files="$(git diff --no-renames --name-only "$c~1" "$c" 2>/dev/null)"
  printf '%s %-62s -> [%s]\n' "$(git rev-parse --short "$c")" "$(git log -1 --format=%s "$c" | cut -c1-62)" \
    "$(printf '%s\n' "$files" | bash "$here/changed-images.sh")"
done

exit $fail
