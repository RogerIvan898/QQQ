#!/bin/sh
# Дамп PostgreSQL. Хранит BACKUP_KEEP_DAYS дней; если задан RCLONE_REMOTE
# (например r2:poker-backups), копирует дамп во внешнее хранилище.
# cron: 15 3 * * * cd /opt/poker/finance && sh backup.sh >> backup.log 2>&1
set -eu
DIR=${BACKUP_DIR:-./backups}
KEEP=${BACKUP_KEEP_DAYS:-14}
mkdir -p "$DIR"
FILE="$DIR/chain-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"

docker compose exec -T postgres pg_dump -U chain -d chain --clean --if-exists | gzip > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
echo "backup: $FILE"

if [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copy "$FILE" "$RCLONE_REMOTE"
fi

find "$DIR" -name 'chain-*.sql.gz' -mtime "+$KEEP" -delete
