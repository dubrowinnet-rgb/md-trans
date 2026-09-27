#!/usr/bin/env bash
# Обновление сервера «Грузоперевозок» до последней версии из GitHub: новые
# миграции базы, Edge Functions, настройки и веб-кабинет. Перед обновлением
# делает резервную копию. Запуск на сервере (одна строка):
#   bash /opt/md-trans/repo/deploy/selfhost/update.sh
#
# Сами компоненты Supabase (их версия закреплена в lib.sh) этот скрипт не
# обновляет — это отдельная операция, её лучше делать вместе с Claude.

set -euo pipefail

self_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
. "$self_dir/lib.sh"

main() {
  require_root
  [ -f "$SUPABASE_DIR/.env" ] || die "Сервер ещё не установлен — сначала install.sh (deploy/selfhost/README.md)."
  local domain branch functions_changed caddy_before
  domain=$(config_get domain)
  [ -n "$domain" ] || die "В $MDTRANS_CONFIG нет домена — установка не была завершена. Запустите install.sh ещё раз."

  # Сначала — свежая версия репозитория, и дальше работает уже её копия
  # этого скрипта (вдруг изменился и он сам).
  if [ "${1:-}" != "--fetched" ]; then
    branch=$(config_get branch)
    log "Скачиваю последнюю версию"
    if [ -z "${MDTRANS_USE_LOCAL_REPO:-}" ]; then
      fetch_branch "$MDTRANS_REPO" "${branch:-$MDTRANS_DEFAULT_BRANCH}"
    fi
    exec bash "$MDTRANS_REPO/deploy/selfhost/update.sh" --fetched
  fi

  bash "$MDTRANS_REPO/deploy/selfhost/backup.sh"

  log "Настройки сервера"
  caddy_before=$(cat "$SUPABASE_DIR/volumes/proxy/caddy/Caddyfile" 2>/dev/null || true)
  apply_config "$domain"
  functions_changed=""
  deploy_functions && functions_changed=1

  log "Обновляю контейнеры (если изменились настройки)"
  (cd "$SUPABASE_DIR" && sh run.sh start)
  if [ -n "$functions_changed" ]; then
    info "Edge Functions изменились — перезапускаю"
    compose restart functions >/dev/null
  fi
  if [ "$caddy_before" != "$(cat "$SUPABASE_DIR/volumes/proxy/caddy/Caddyfile")" ]; then
    info "Настройки HTTPS изменились — перезапускаю Caddy"
    compose restart caddy >/dev/null
  fi

  log "Миграции базы"
  run_migrations

  if [ -z "${MDTRANS_SKIP_WEB:-}" ]; then
    log "Веб-кабинет"
    deploy_web
  fi

  log "Проверяю, что сервер отвечает"
  wait_http_ok "https://api.$domain/auth/v1/health" "$(env_get ANON_KEY)" 60 \
    || die "https://api.$domain не отвечает после обновления. Пришлите Claude вывод команды: cd $SUPABASE_DIR && sh run.sh status"
  log "Готово: сервер обновлён"
}

main "$@"
exit $?
