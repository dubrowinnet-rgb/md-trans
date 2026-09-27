#!/usr/bin/env bash
# Резервная копия сервера «Грузоперевозок»: база (pg_dump), фото из Storage
# и файл .env с паролями и ключами сервера. Запускается каждую ночь по cron
# (/etc/cron.d/md-trans-backup, ставит install.sh) и перед каждым
# обновлением (update.sh). Вручную (одна строка):
#   bash /opt/md-trans/repo/deploy/selfhost/backup.sh
#
# Копии лежат в /opt/md-trans/backups на этом же сервере: база и ключи —
# 14 дней, фото — 7 дней. От поломки самого сервера они не спасут — для
# этого включите автоматические резервные копии сервера у хостинга
# (deploy/selfhost/README.md).

set -euo pipefail

self_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
. "$self_dir/lib.sh"

main() {
  require_root
  local stamp
  stamp=$(date +%Y-%m-%d_%H-%M-%S)
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  log "Резервная копия $stamp в $BACKUP_DIR"

  # supabase_admin — суперпользователь базы: видит все схемы (auth, storage,
  # cron), у роли postgres на часть из них прав нет.
  docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc > "$BACKUP_DIR/db_$stamp.dump.part" \
    || { rm -f "$BACKUP_DIR/db_$stamp.dump.part"; die "Не удалось сделать копию базы."; }
  mv "$BACKUP_DIR/db_$stamp.dump.part" "$BACKUP_DIR/db_$stamp.dump"

  tar -czf "$BACKUP_DIR/storage_$stamp.tar.gz" -C "$SUPABASE_DIR/volumes" storage
  cp "$SUPABASE_DIR/.env" "$BACKUP_DIR/env_$stamp"
  chmod 600 "$BACKUP_DIR/db_$stamp.dump" "$BACKUP_DIR/storage_$stamp.tar.gz" "$BACKUP_DIR/env_$stamp"

  find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db_*.dump' -o -name 'env_*' \) -mtime +14 -delete
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'storage_*.tar.gz' -mtime +7 -delete
  info "Готово. Все копии занимают $(du -sh "$BACKUP_DIR" | cut -f1)."
}

main "$@"
exit $?
