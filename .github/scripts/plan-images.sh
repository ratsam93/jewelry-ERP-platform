#!/usr/bin/env bash
# Decides, per image, whether it must be BUILT or can be RE-TAGGED from the image that is
# currently tagged :latest (= the last successfully deployed build; see deploy.yml).
#
# An image is rebuilt when ANY of these is true (every doubt means rebuild):
#   - REBUILD_ALL=true
#   - there is no :latest image, or it lacks the labels written by this workflow
#     (org.opencontainers.image.revision, cf.build-args-hash)
#   - the build-args hash differs (DOMAIN / TENANT_ID / TENANT_SLUG / IMAGE_HOSTS changed)
#   - the revision recorded on :latest is not a commit available in this checkout
#   - a file in `git diff <that revision> <SHA>` is an input of the image
#     (.github/scripts/changed-images.sh)
# Otherwise the image is re-tagged BY DIGEST (no rebuild).
#
# Using the revision label of the image itself (instead of github.event.before) means
# skipped, cancelled or failed runs can never hide a change.
#
# Needs a full-history checkout and a docker login to GHCR. Env: REGISTRY, OWNER, SHA,
# REBUILD_ALL, DOMAIN, TENANT_ID, TENANT_SLUG, IMAGE_HOSTS.
# Writes build_images (JSON array) and retag (JSON array of {image,digest}) to $GITHUB_OUTPUT.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${REGISTRY:?}" "${OWNER:?}" "${SHA:?}"
REBUILD_ALL="${REBUILD_ALL:-false}"
IMAGES=(api web storefront website minio mc)

# JSON helpers (node is preinstalled on runners; jq is not assumed).
label_of() { # $1 = label key; stdin = `imagetools inspect --format {{json .Image}}`
  node -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      const j = JSON.parse(s);
      const img = j.config ? j : (j["linux/amd64"] || Object.values(j)[0] || {});
      process.stdout.write(String(((img.config || {}).Labels || {})[process.argv[1]] || ""));
    });' "$1"
}
digest_of() { # stdin = `imagetools inspect --format {{json .Manifest}}`
  node -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      process.stdout.write(String(JSON.parse(s).digest || ""));
    });'
}

build_json=""
retag_json=""
summary=""
nl=$'\n'

for img in "${IMAGES[@]}"; do
  repo="$REGISTRY/$OWNER/caratflow-$img"
  want_hash="$(bash "$here/build-args.sh" "$img" | sha256sum | cut -d' ' -f1)"
  action="build"; reason=""; digest=""

  if [ "$REBUILD_ALL" = "true" ]; then
    reason="rebuild_all requested"
  elif ! cfg="$(docker buildx imagetools inspect "$repo:latest" --format '{{json .Image}}' 2>/dev/null)" \
    || ! man="$(docker buildx imagetools inspect "$repo:latest" --format '{{json .Manifest}}' 2>/dev/null)"; then
    reason="no :latest image"
  else
    base="$(printf '%s' "$cfg" | label_of org.opencontainers.image.revision || true)"
    have_hash="$(printf '%s' "$cfg" | label_of cf.build-args-hash || true)"
    digest="$(printf '%s' "$man" | digest_of || true)"
    if [ -z "$digest" ] || [ -z "$base" ] || [ -z "$have_hash" ]; then
      reason=":latest has no revision/hash labels"
    elif [ "$have_hash" != "$want_hash" ]; then
      reason="build variables changed"
    elif ! [[ "$base" =~ ^[0-9a-f]{40}$ ]] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
      reason="base commit ${base:0:12} not available"
    else
      hit="$(git diff --no-renames --name-only "$base" "$SHA" | bash "$here/changed-images.sh")"
      if [[ " $hit " == *" $img "* ]]; then
        reason="inputs changed since ${base:0:12}"
      else
        action="retag"; reason="unchanged since ${base:0:12}"
      fi
    fi
  fi

  echo "plan: $img -> $action ($reason)" >&2
  summary="$summary| $img | $action | $reason |$nl"
  if [ "$action" = "build" ]; then
    build_json="$build_json${build_json:+,}\"$img\""
  else
    retag_json="$retag_json${retag_json:+,}{\"image\":\"$img\",\"digest\":\"$digest\"}"
  fi
done

out="${GITHUB_OUTPUT:-/dev/stdout}"
{
  echo "build_images=[$build_json]"
  echo "retag=[$retag_json]"
} >> "$out"

{
  echo "### Image plan"
  echo "| image | action | reason |"
  echo "| --- | --- | --- |"
  printf '%s' "$summary"
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
