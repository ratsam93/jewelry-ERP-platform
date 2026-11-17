#!/usr/bin/env bash
# Daily backup of the CaratFlow MySQL database (and optionally uploaded files).
# Runs on the host, from cron (installed by server-setup.sh) or by hand:
#   /opt/caratflow/backup.sh
# Keeps BACKUP_RETENTION_DAYS days (default 7) in BACKUP_DIR (default /opt/caratflow/backups).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/caratflow}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
BACKUP_FILES="${BACKUP_FILES:-true}"   # also archive the MinIO uploads volume
COMPOSE=(docker compose -f "$APP_DIR/docker-compose.prod.yml" --env-file "$APP_DIR/.env" --project-directory "$APP_DIR")

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR"
umask 077
stamp="$(date +%Y%m%d-%H%M%S)"
db_file="$BACKUP_DIR/caratflow-db-$stamp.sql.gz"

# The password is read inside the container, never put on a command line.
"${COMPOSE[@]}" exec -T mysql sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction --quick --routines --triggers --events --no-tablespaces "$MYSQL_DATABASE"' \
  | gzip -9 > "$db_file.part"

gzip -t "$db_file.part"
if [ "$(gzip -dc "$db_file.part" | head -c 200 | wc -c)" -lt 50 ]; then
  rm -f "$db_file.part"; echo "backup failed: dump is empty" >&2; exit 1
fi
mv "$db_file.part" "$db_file"
echo "database backup: $db_file ($(du -h "$db_file" | cut -f1))"

if [ "$BACKUP_FILES" = "true" ]; then
  vol="$(docker volume ls -q --filter name='caratflow_minio_data$' | head -n1 || true)"
  if [ -n "$vol" ]; then
    files_file="$BACKUP_DIR/caratflow-files-$stamp.tar.gz"
    docker run --rm -v "$vol":/data:ro -v "$BACKUP_DIR":/backup alpine:3 \
      tar czf "/backup/$(basename "$files_file")" -C /data .
    echo "files backup: $files_file ($(du -h "$files_file" | cut -f1))"
  fi
fi

find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'caratflow-db-*.sql.gz' -o -name 'caratflow-files-*.tar.gz' \) \
  -mtime +"$RETENTION_DAYS" -print -delete | sed 's/^/pruned: /'
echo "backup finished $(date -Is)"
