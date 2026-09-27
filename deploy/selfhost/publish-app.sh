#!/usr/bin/env bash
# Раз в час проверяет, не собрана ли новая версия приложения для телефонов,
# и выкладывает её на страницу «Установка приложения» веб-кабинета. Код
# сервера при этом не обновляется — из GitHub читается только
# deploy/app-release.json (его обновляет тот, кто собирает приложение).
# Запускается по cron (/etc/cron.d/md-trans-app, ставит install.sh). Вручную
# (одна строка):
#   bash /opt/md-trans/repo/deploy/selfhost/publish-app.sh

set -euo pipefail

self_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
. "$self_dir/lib.sh"

main() {
  require_root
  [ -f "$MDTRANS_CONFIG" ] || exit 0
  # Если прямо сейчас идёт обновление сервера — оно само выложит приложение.
  take_lock -n || exit 0

  local branch raw tmp
  branch=$(config_get branch)
  raw="${MDTRANS_REPO_URL/github.com/raw.githubusercontent.com}/refs/heads/${branch:-$MDTRANS_DEFAULT_BRANCH}/deploy/app-release.json"
  tmp=$(mktemp)
  # Файла в этой версии репозитория ещё нет (404) или GitHub недоступен —
  # страница установки остаётся как есть.
  if curl -fsL --retry 2 --max-time 60 -o "$tmp" "$raw"; then
    publish_app_files "$tmp"
  fi
  rm -f "$tmp"
}

main "$@"
