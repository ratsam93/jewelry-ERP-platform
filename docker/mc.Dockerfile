# syntax=docker/dockerfile:1.7
# MinIO client (mc) built FROM SOURCE (AGPL-3.0, https://github.com/minio/mc).
# Used by the one-shot `minio-init` service to create the bucket. See minio.Dockerfile.

FROM golang:1.24-alpine AS build
ARG MC_TAG=RELEASE.2025-04-16T18-13-26Z
ARG MC_COMMIT=b00526b153a31b36767991a4f5ce2cced435ee8e
ENV CGO_ENABLED=0 GOFLAGS=-mod=readonly
RUN apk add --no-cache git ca-certificates
WORKDIR /src
RUN git clone --quiet --depth 1 --branch "$MC_TAG" https://github.com/minio/mc.git . \
 && test "$(git rev-parse HEAD)" = "$MC_COMMIT"
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    set -eux; \
    version="$(echo "${MC_TAG#RELEASE.}" | sed -E 's/T([0-9]{2})-([0-9]{2})-([0-9]{2})Z/T\1:\2:\3Z/')"; \
    ldflags="$(MC_RELEASE=RELEASE go run buildscripts/gen-ldflags.go "$version")"; \
    go build -trimpath -tags kqueue -ldflags "$ldflags" -o /out/mc . ; \
    /out/mc --version

FROM alpine:3.21
RUN apk add --no-cache ca-certificates \
 && addgroup -S -g 10001 mc \
 && adduser -S -u 10001 -G mc -h /nonexistent -s /sbin/nologin mc
COPY --from=build /out/mc /usr/bin/mc
ENV MC_CONFIG_DIR=/tmp/.mc
LABEL org.opencontainers.image.title="mc (built from source)" \
      org.opencontainers.image.source="https://github.com/minio/mc" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"
USER 10001:10001
ENTRYPOINT ["mc"]
