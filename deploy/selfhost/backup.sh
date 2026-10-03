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
#
# Фото копируются снимком из жёстких ссылок: снимок видит все фото, но
# места почти не занимает — файлы фото никогда не переписываются, снимок
# хранит только те, что с тех пор удалили. Раньше каждую ночь всё хранилище
# упаковывалось в архив заново: при тысячах водителей с фото каждый день это
# сотни гигабайт одинаковых копий и часы работы диска.

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

  # Если папка копий на другом диске, жёсткие ссылки невозможны — тогда
  # обычная копия.
  rm -rf "$BACKUP_DIR/storage_$stamp.part"
  if ! cp -al "$SUPABASE_DIR/volumes/storage" "$BACKUP_DIR/storage_$stamp.part" 2>/dev/null; then
    rm -rf "$BACKUP_DIR/storage_$stamp.part"
    cp -a "$SUPABASE_DIR/volumes/storage" "$BACKUP_DIR/storage_$stamp.part" \
      || { rm -rf "$BACKUP_DIR/storage_$stamp.part"; die "Не удалось сделать копию фото."; }
  fi
  mv "$BACKUP_DIR/storage_$stamp.part" "$BACKUP_DIR/storage_$stamp"
  cp "$SUPABASE_DIR/.env" "$BACKUP_DIR/env_$stamp"
  chmod 600 "$BACKUP_DIR/db_$stamp.dump" "$BACKUP_DIR/env_$stamp"

  find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db_*.dump' -o -name 'env_*' \) -mtime +14 -delete
  # Снимки фото — по времени в имени (у папки время изменения берётся от
  # самого хранилища). Архивы фото старого формата удаляются так же.
  local cutoff dir
  cutoff=$(date -d '7 days ago' +%Y-%m-%d_%H-%M-%S)
  for dir in "$BACKUP_DIR"/storage_????-??-??_??-??-??; do
    [ -d "$dir" ] || continue
    if [[ "${dir##*/storage_}" < "$cutoff" ]]; then
      rm -rf "${dir:?}"
    fi
  done
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'storage_*.tar.gz' -mtime +7 -delete
  info "Готово. Все копии занимают $(du -sh "$BACKUP_DIR" | cut -f1)."
}

main "$@"
exit $?
