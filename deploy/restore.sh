#!/usr/bin/env bash
# Restore a database backup made by backup.sh. DESTRUCTIVE: replaces the current data.
#   /opt/caratflow/restore.sh /opt/caratflow/backups/caratflow-db-YYYYMMDD-HHMMSS.sql.gz
# Set ASSUME_YES=true to skip the confirmation prompt.
set -euo pipefail

file="${1:-}"
[ -n "$file" ] && [ -f "$file" ] || { echo "usage: $0 <backup.sql.gz>" >&2; exit 2; }
gzip -t "$file"

APP_DIR="${APP_DIR:-/opt/caratflow}"
COMPOSE=(docker compose -f "$APP_DIR/docker-compose.prod.yml" --env-file "$APP_DIR/.env" --project-directory "$APP_DIR")
cd "$APP_DIR"

if [ "${ASSUME_YES:-false}" != "true" ]; then
  read -r -p "This REPLACES the live database with $file. Type RESTORE to continue: " answer
  [ "$answer" = "RESTORE" ] || { echo "aborted"; exit 1; }
fi

echo "stopping the apps that use the database..."
"${COMPOSE[@]}" stop api web storefront >/dev/null

echo "restoring..."
"${COMPOSE[@]}" exec -T mysql sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"'
gzip -dc "$file" | "${COMPOSE[@]}" exec -T mysql sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot "$MYSQL_DATABASE"'

echo "starting the apps..."
"${COMPOSE[@]}" up -d
echo "restore finished. Uploaded files are not part of this restore (see docs/DEPLOYMENT-DOCKER.md)."
