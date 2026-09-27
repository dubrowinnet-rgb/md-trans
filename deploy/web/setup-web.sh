#!/bin/sh
#
# Веб-кабинет md-trans на сервере с self-hosted Supabase: собрать, выложить
# и подключить к Caddy. Один и тот же запуск и для первой установки, и для
# обновления после `git pull` — повторять безопасно.
#
#   sh deploy/web/setup-web.sh <папка проекта Supabase>
#
# Что берёт из .env проекта Supabase:
#   SUPABASE_PUBLIC_URL  адрес API (https://api.<домен>) — вшивается в сборку
#   ANON_KEY             публичный ключ — тоже вшивается в сборку
#   PROXY_DOMAIN         api.<домен> — на нём Caddy отдаёт API и Studio
#   WEB_DOMAIN           <домен> кабинета; если пусто — PROXY_DOMAIN без «api.»
#
# Что делает:
#   1. Собирает web/ в контейнере Node (на сервере Node ставить не нужно).
#   2. Кладёт сборку в volumes/proxy/mdtrans/www/releases/<время> и
#      переключает на неё ссылку current — без простоя, 3 последние остаются.
#   3. Копирует наш Caddyfile и docker-compose.mdtrans-web.yml в проект
#      Supabase и включает их (sh run.sh config add caddy mdtrans-web).
#   4. Перезапускает Caddy, если он уже работает, чтобы подхватить настройки.

set -e

REPO_DIR=$(cd "$(dirname "$0")/../.." && pwd)
WEB_SRC="$REPO_DIR/web"
DEPLOY_SRC="$REPO_DIR/deploy/web"
NODE_IMAGE="${NODE_IMAGE:-node:22-alpine}"
KEEP_RELEASES=3

log() { printf "===> %s\n" "$*"; }
die() { printf "ERROR: %s\n" "$*" >&2; exit 1; }

[ $# -ge 1 ] || die "usage: sh deploy/web/setup-web.sh <supabase-project-dir>"
SUPABASE_DIR=$(cd "$1" 2>/dev/null && pwd) || die "folder not found: $1"
ENV_FILE="$SUPABASE_DIR/.env"
[ -f "$ENV_FILE" ] && [ -f "$SUPABASE_DIR/run.sh" ] && [ -f "$SUPABASE_DIR/docker-compose.caddy.yml" ] \
    || die "$SUPABASE_DIR is not a self-hosted Supabase project (need .env, run.sh, docker-compose.caddy.yml)"
[ -f "$WEB_SRC/package.json" ] || die "web/ not found next to deploy/ in $REPO_DIR"
docker info >/dev/null 2>&1 || die "docker is not available (run as root or a user in the docker group)"

read_env() {
    grep "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d "\r\"'"
}

# Заменить значение в .env или дописать строку в конец.
set_env() {
    if grep -q "^$1=" "$ENV_FILE"; then
        sed -i.old -e "s|^$1=.*$|$1=$2|" "$ENV_FILE" && rm -f "$ENV_FILE.old"
    else
        printf '\n# Web cabinet domain (deploy/web/setup-web.sh)\n%s=%s\n' "$1" "$2" >> "$ENV_FILE"
    fi
}

API_URL=$(read_env SUPABASE_PUBLIC_URL)
ANON_KEY=$(read_env ANON_KEY)
PROXY_DOMAIN=$(read_env PROXY_DOMAIN)
WEB_DOMAIN=$(read_env WEB_DOMAIN)

case "$API_URL" in
    https://?*) ;;
    *) die "SUPABASE_PUBLIC_URL in $ENV_FILE must be https://<api domain>, got '$API_URL'" ;;
esac
[ -n "$ANON_KEY" ] || die "ANON_KEY is empty in $ENV_FILE"
case "$PROXY_DOMAIN" in
    ""|your-domain.example.com) die "PROXY_DOMAIN is not set in $ENV_FILE" ;;
esac
if [ -z "$WEB_DOMAIN" ]; then
    case "$PROXY_DOMAIN" in
        api.?*) WEB_DOMAIN=${PROXY_DOMAIN#api.} ;;
        *) die "PROXY_DOMAIN '$PROXY_DOMAIN' does not start with api. — set WEB_DOMAIN=<cabinet domain> in $ENV_FILE" ;;
    esac
    set_env WEB_DOMAIN "$WEB_DOMAIN"
fi
log "Web cabinet: https://$WEB_DOMAIN  (API: $API_URL)"

# Сборке Next.js нужно около 1,5 ГБ памяти. На небольшом сервере, где рядом
# уже работает Supabase, без подкачки её может убить нехватка памяти.
ensure_swap() {
    mem_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
    swap_kb=$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)
    [ "$mem_kb" -ge 7500000 ] && return 0
    [ "$swap_kb" -ge 1500000 ] && return 0
    [ "$(id -u)" = "0" ] || { log "Low memory and no swap; the build may fail (run as root to add swap)"; return 0; }
    [ -e /swapfile ] && return 0
    log "Adding a 2 GB swap file (/swapfile) so the build has enough memory"
    fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
}
ensure_swap

log "Building the web cabinet in $NODE_IMAGE (first run downloads packages, a few minutes)"
rm -rf "$WEB_SRC/out"
# WEB_BUILD_DOCKER_OPTS — дополнительные параметры docker run, если серверу
# нужен прокси для npm (например "--network host -e HTTPS_PROXY").
# shellcheck disable=SC2086
docker run --rm ${WEB_BUILD_DOCKER_OPTS:-} \
    -v "$WEB_SRC:/app" -w /app \
    -e NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
    -e NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
    -e NEXT_TELEMETRY_DISABLED=1 \
    "$NODE_IMAGE" \
    sh -c 'npm ci --no-audit --no-fund --loglevel=error && npm run build' \
    || die "web cabinet build failed (the previous version stays online)"
[ -f "$WEB_SRC/out/index.html" ] || die "build finished but web/out/index.html is missing"

MDTRANS_DIR="$SUPABASE_DIR/volumes/proxy/mdtrans"
WWW="$MDTRANS_DIR/www"
release=$(date +%Y%m%d-%H%M%S)
log "Publishing build as www/releases/$release"
mkdir -p "$WWW/releases" "$MDTRANS_DIR/files"
cp -a "$WEB_SRC/out" "$WWW/releases/$release"
ln -sfn "releases/$release" "$WWW/current.new"
mv -Tf "$WWW/current.new" "$WWW/current"
# Старые сборки, кроме последних KEEP_RELEASES.
ls -1d "$WWW"/releases/* | sort -r | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
    rm -rf "$old"
done

log "Installing Caddy config for $WEB_DOMAIN"
old_caddyfile=$(cat "$MDTRANS_DIR/Caddyfile" 2>/dev/null || true)
old_overlay=$(cat "$SUPABASE_DIR/docker-compose.mdtrans-web.yml" 2>/dev/null || true)
cp "$DEPLOY_SRC/Caddyfile" "$MDTRANS_DIR/Caddyfile"
cp "$DEPLOY_SRC/docker-compose.mdtrans-web.yml" "$SUPABASE_DIR/docker-compose.mdtrans-web.yml"

# Порядок важен: наш файл дополняет сервис caddy, поэтому идёт после него.
( cd "$SUPABASE_DIR" && sh run.sh config remove mdtrans-web >/dev/null && sh run.sh config add caddy mdtrans-web >/dev/null )
log "Compose files: $(read_env COMPOSE_FILE)"

# Если Caddy уже запущен — пересоздать с новой конфигурацией (пара секунд).
# Если нет — он поднимется вместе со всем стеком (sh run.sh start).
if ( cd "$SUPABASE_DIR" && docker compose ps --status running --services 2>/dev/null | grep -qx caddy ); then
    if [ "$old_caddyfile" != "$(cat "$MDTRANS_DIR/Caddyfile")" ] \
        || [ "$old_overlay" != "$(cat "$SUPABASE_DIR/docker-compose.mdtrans-web.yml")" ]; then
        log "Restarting Caddy with the new config"
        ( cd "$SUPABASE_DIR" && docker compose up -d --force-recreate --no-deps caddy )
    else
        # Конфигурация та же — новая сборка уже отдаётся через ссылку current.
        log "Caddy config unchanged; new build is live"
    fi
else
    log "Caddy is not running yet; start the stack with: cd $SUPABASE_DIR && sh run.sh start"
fi

log "Done. Web cabinet: https://$WEB_DOMAIN"
