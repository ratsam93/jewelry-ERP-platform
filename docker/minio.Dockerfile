# syntax=docker/dockerfile:1.7
# MinIO server built FROM SOURCE (AGPL-3.0, https://github.com/minio/minio).
#
# MinIO stopped publishing its community images to Docker Hub / Quay, so we build the
# pinned release ourselves and push it to GHCR as caratflow-minio (see
# .github/workflows/deploy.yml). Same server, same S3 behaviour, same flags as the
# upstream Makefile (CGO off, -trimpath, ldflags from buildscripts/gen-ldflags.go).
#
#   docker build -f docker/minio.Dockerfile -t caratflow-minio .
#
# To upgrade, change MINIO_TAG and MINIO_COMMIT together (the commit pin makes the
# build fail if the tag is ever moved).

FROM golang:1.24-alpine AS build
ARG MINIO_TAG=RELEASE.2025-04-22T22-12-26Z
ARG MINIO_COMMIT=0d7408fc9969caf07de6a8c3a84f9fbb10a6739e
ENV CGO_ENABLED=0 GOFLAGS=-mod=readonly
RUN apk add --no-cache git ca-certificates
WORKDIR /src
RUN git clone --quiet --depth 1 --branch "$MINIO_TAG" https://github.com/minio/minio.git . \
 && test "$(git rev-parse HEAD)" = "$MINIO_COMMIT"
# BuildKit cache mounts keep the module download and the (slow) compile cache between builds.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    set -eux; \
    version="$(echo "${MINIO_TAG#RELEASE.}" | sed -E 's/T([0-9]{2})-([0-9]{2})-([0-9]{2})Z/T\1:\2:\3Z/')"; \
    ldflags="$(MINIO_RELEASE=RELEASE go run buildscripts/gen-ldflags.go "$version")"; \
    go build -trimpath -ldflags "$ldflags" -o /out/minio . ; \
    /out/minio --version

FROM alpine:3.21
RUN apk add --no-cache ca-certificates \
 && addgroup -S -g 10001 minio \
 && adduser -S -u 10001 -G minio -h /nonexistent -s /sbin/nologin minio \
 && mkdir /data && chown minio:minio /data
COPY --from=build /out/minio /usr/bin/minio
LABEL org.opencontainers.image.title="minio (built from source)" \
      org.opencontainers.image.source="https://github.com/minio/minio" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"
USER 10001:10001
EXPOSE 9000 9001
VOLUME ["/data"]
ENTRYPOINT ["minio"]
CMD ["server", "/data"]
