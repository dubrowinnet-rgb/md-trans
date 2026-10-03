#!/usr/bin/env bash
# Установка сервера «Грузоперевозок» на новый VPS в России (Ubuntu 24.04
# или 22.04). Подробная инструкция — README.md рядом с этим файлом.
#
# Запуск на сервере, строго по одной строке:
#   curl -fsSL https://raw.githubusercontent.com/dubrowinnet-rgb/md-trans/refs/heads/claude/project-thread-cbnmzl/deploy/selfhost/install.sh -o install.sh
#   bash install.sh
#
# Что делает:
#   1. Спрашивает домен, название компании, ваше имя, телефон и пароли.
#   2. Ставит Docker и нужные программы, файл подкачки и защиту SSH от
#      подбора пароля (fail2ban).
#   3. Скачивает этот репозиторий и официальную сборку Supabase (версия
#      закреплена в lib.sh), генерирует все пароли и ключи сервера.
#   4. Запускает Supabase и Caddy (HTTPS, сертификат Let's Encrypt).
#   5. Накатывает все миграции базы и разворачивает Edge Functions.
#   6. Создаёт вашу компанию, вход администратора и вход владельца сервиса.
#   7. Собирает и выкладывает веб-кабинет (deploy/web).
#   8. Включает ежедневные резервные копии.
#
# Повторный запуск безопасен: сделанное пропускается или обновляется.
#
# Для проверки на тестовой машине (не для настоящего сервера): ответы можно
# передать переменными MDTRANS_DOMAIN, MDTRANS_COMPANY, MDTRANS_ADMIN_NAME,
# MDTRANS_ADMIN_PHONE, MDTRANS_ADMIN_PASSWORD, MDTRANS_OWNER_PASSWORD;
# MDTRANS_SKIP_SYSTEM=1 не трогает систему (пакеты, Docker, swap, cron),
# MDTRANS_USE_LOCAL_REPO=1 берёт репозиторий из MDTRANS_REPO как есть,
# MDTRANS_SKIP_WEB=1 не собирает веб-кабинет.

set -euo pipefail

self_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# Скачанный отдельно install.sh сначала скачивает репозиторий целиком и
# дальше запускает свою копию оттуда (рядом с ней lib.sh и остальные файлы).
# Ветка по умолчанию — та же, что MDTRANS_DEFAULT_BRANCH в lib.sh.
if [ ! -f "$self_dir/lib.sh" ]; then
  [ "$(id -u)" = "0" ] || { echo "ОШИБКА: запустите от имени root (sudo -i, затем команду ещё раз)." >&2; exit 1; }
  base="${MDTRANS_BASE:-/opt/md-trans}"
  repo="${MDTRANS_REPO:-$base/repo}"
  branch="claude/project-thread-cbnmzl"
  if [ -f "$base/config" ] && grep -q '^branch=.' "$base/config"; then
    branch=$(grep '^branch=' "$base/config" | head -n1 | cut -d= -f2-)
  fi
  echo "==> Скачиваю файлы установки (ветка $branch)"
  if ! command -v git >/dev/null 2>&1; then
    apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -qq -y git ca-certificates >/dev/null
  fi
  if [ -d "$repo/.git" ]; then
    git -C "$repo" fetch -q --depth 1 origin "$branch" && git -C "$repo" reset -q --hard FETCH_HEAD
  else
    mkdir -p "$base"
    git clone -q --depth 1 --branch "$branch" https://github.com/dubrowinnet-rgb/md-trans "$repo"
  fi
  exec bash "$repo/deploy/selfhost/install.sh" "$@"
fi

# shellcheck source=lib.sh
. "$self_dir/lib.sh"

# --- Вопросы ---------------------------------------------------------------

# ask_password ПЕРЕМЕННАЯ "Вопрос" [значение, если нажали Enter]
ask_password() {
  local var="$1" prompt="$2" fallback="${3:-}" p1 p2
  [ -n "${!var:-}" ] && return 0
  while :; do
    printf '%s: ' "$prompt" >/dev/tty
    IFS= read -r -s p1 </dev/tty || die "Не удалось прочитать ответ."
    printf '\n' >/dev/tty
    if [ -z "$p1" ] && [ -n "$fallback" ]; then
      printf -v "$var" '%s' "$fallback"
      return 0
    fi
    if [ "${#p1}" -lt 8 ]; then
      printf '  Нужно минимум 8 символов.\n' >/dev/tty
      continue
    fi
    printf 'Повторите пароль: ' >/dev/tty
    IFS= read -r -s p2 </dev/tty || die "Не удалось прочитать ответ."
    printf '\n' >/dev/tty
    [ "$p1" = "$p2" ] && break
    printf '  Пароли не совпали, введите ещё раз.\n' >/dev/tty
  done
  printf -v "$var" '%s' "$p1"
}

# Любая запись российского номера → +7XXXXXXXXXX (как create-account).
phone_e164() {
  local digits core
  digits=$(printf '%s' "$1" | tr -cd '0-9')
  if [ "${#digits}" -eq 11 ] && { [ "${digits:0:1}" = "7" ] || [ "${digits:0:1}" = "8" ]; }; then
    core="${digits:1}"
  elif [ "${#digits}" -eq 10 ]; then
    core="$digits"
  else
    return 1
  fi
  printf '+7%s' "$core"
}

# +7XXXXXXXXXX → +7(XXX)XXX-XX-XX — формат, в котором телефоны хранит приложение.
phone_pretty() {
  local c="${1#+7}"
  printf '+7(%s)%s-%s-%s' "${c:0:3}" "${c:3:3}" "${c:6:2}" "${c:8:2}"
}

# «https://www.Example.ru/» → «example.ru». Пусто, если на домен не похоже.
# Кириллический домен (например, .рф) переводится в punycode (xn--…) — в
# таком виде его понимают DNS и сертификаты, а браузер покажет кириллицей.
normalize_domain() {
  local d
  d=$(printf '%s' "$1" | sed -e 's#^[A-Za-z]*://##' -e 's#/.*$##')
  if printf '%s' "$d" | LC_ALL=C grep -q '[^ -~]'; then
    d=$(python3 -c 'import sys; print(sys.argv[1].lower().encode("idna").decode())' "$d" 2>/dev/null) || return 1
  fi
  d=$(printf '%s' "$d" | tr 'A-Z' 'a-z' | sed -e 's#^www\.##' -e 's#^api\.##')
  case "$d" in *.*) ;; *) return 1 ;; esac
  case "$d" in *[!a-z0-9.-]*|.*|*.) return 1 ;; esac
  printf '%s' "$d"
}

ask_questions() {
  DOMAIN="${MDTRANS_DOMAIN:-$(config_get domain)}"
  if [ -z "$DOMAIN" ]; then
    say ""
    say "Домен, который вы купили для сервиса (например, mdtrans.ru)."
    say "У домена должны быть три DNS-записи A на IP этого сервера: @, www и api."
    while :; do
      ask DOMAIN_INPUT "Домен"
      DOMAIN=$(normalize_domain "$DOMAIN_INPUT") && break
      printf '  Не похоже на домен. Пример: mdtrans.ru\n' >/dev/tty
      DOMAIN_INPUT=""
    done
  fi

  if [ "$(config_get accounts_created)" = "yes" ]; then
    return 0
  fi
  say ""
  say "Теперь вход администратора — это вы. Им же вы войдёте в приложение и веб-кабинет."
  ask MDTRANS_COMPANY "Название вашей компании (так её увидят в приложении)"
  ask MDTRANS_ADMIN_NAME "Ваше имя"
  while :; do
    ask MDTRANS_ADMIN_PHONE "Ваш номер телефона (это логин)"
    ADMIN_E164=$(phone_e164 "$MDTRANS_ADMIN_PHONE") && break
    printf '  Нужен российский номер из 10 цифр после +7, например +7 916 123-45-67\n' >/dev/tty
    MDTRANS_ADMIN_PHONE=""
  done
  ask_password MDTRANS_ADMIN_PASSWORD "Пароль администратора (не меньше 8 символов; при вводе не виден)"
  say ""
  say "Отдельный вход владельца сервиса — кабинет, где видны все компании-клиенты."
  say "Логин у него owner, входить на сайте через «Войти по логину или email»."
  ask_password MDTRANS_OWNER_PASSWORD "Пароль владельца (Enter — такой же, как у администратора)" "$MDTRANS_ADMIN_PASSWORD"
}

# Предупреждает, если DNS-записи домена ещё не указывают на этот сервер.
# Установку не останавливает: Caddy получит сертификат сам, когда записи
# заработают.
check_dns() {
  local ip name resolved missing=""
  case "$DOMAIN" in *localhost) return 0 ;; esac
  ip=$(curl -s --max-time 10 https://ipv4-internet.yandex.net/api/v0/ip 2>/dev/null | tr -d '"' || true)
  case "$ip" in *.*.*.*) ;; *) ip=$(hostname -I 2>/dev/null | awk '{print $1}') ;; esac
  log "Проверяю DNS-записи домена (IP этого сервера: ${ip:-не определён})"
  for name in "$DOMAIN" "www.$DOMAIN" "api.$DOMAIN"; do
    resolved=$(getent ahostsv4 "$name" 2>/dev/null | awk '{print $1; exit}' || true)
    if [ -z "$resolved" ]; then
      info "$name — записи пока нет"
      missing=1
    elif [ -n "$ip" ] && [ "$resolved" != "$ip" ]; then
      info "$name → $resolved (а у сервера $ip)"
      missing=1
    else
      info "$name → $resolved — в порядке"
    fi
  done
  if [ -n "$missing" ]; then
    warn "Не все записи указывают на этот сервер. Установку продолжаю; сайт и API заработают по HTTPS, когда записи обновятся (обычно от нескольких минут до нескольких часов)."
  fi
}

# --- Система ---------------------------------------------------------------

ensure_swap() {
  [ "$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)" -gt 0 ] && return 0
  [ -e /swapfile ] && return 0
  log "Добавляю файл подкачки 2 ГБ"
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    info "Docker уже установлен: $(docker --version)"
    return 0
  fi
  log "Устанавливаю Docker"
  # shellcheck disable=SC1091
  . /etc/os-release
  if curl -fsS --max-time 20 -o /dev/null "https://download.docker.com/linux/$ID/gpg"; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL "https://download.docker.com/linux/$ID/gpg" | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -qq -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
  else
    warn "Сайт Docker недоступен с сервера — ставлю Docker из репозитория Ubuntu."
    apt-get install -qq -y docker.io docker-compose-v2 >/dev/null
  fi
  systemctl enable --now docker >/dev/null 2>&1 || true
  docker compose version >/dev/null 2>&1 || die "Docker установился, но команда «docker compose» не работает."
}

# Ограничивает размер логов контейнеров (иначе за месяцы они заполнят диск)
# и, если Docker Hub с сервера недоступен, включает зеркала.
configure_docker() {
  local file=/etc/docker/daemon.json current updated
  mkdir -p /etc/docker
  current=$( [ -s "$file" ] && jq -S . "$file" || echo '{}' )
  updated=$(printf '%s' "$current" | jq -S '. + {"log-driver": "json-file", "log-opts": {"max-size": "20m", "max-file": "3"}}')
  if ! docker pull -q hello-world >/dev/null 2>&1; then
    warn "Docker Hub недоступен с сервера — подключаю зеркала."
    updated=$(printf '%s' "$updated" | jq -S '. + {"registry-mirrors": ["https://dockerhub.timeweb.cloud", "https://mirror.gcr.io"]}')
  fi
  if [ "$updated" != "$current" ]; then
    printf '%s\n' "$updated" > "$file"
    systemctl restart docker
  fi
  docker pull -q hello-world >/dev/null 2>&1 \
    || warn "Docker по-прежнему не может скачивать образы. Установка, скорее всего, остановится на загрузке — пришлите Claude текст ошибки."
  docker rmi -f hello-world >/dev/null 2>&1 || true

  # Нужны теги !reset и !override (docker compose 2.24+) — их использует и
  # официальная сборка Supabase, и наш docker-compose.mdtrans.yml.
  local t
  t=$(mktemp -d)
  printf 'services:\n  a:\n    image: busybox\n    ports: ["1:1"]\n' > "$t/a.yml"
  printf 'services:\n  a:\n    ports: !override ["2:2"]\n' > "$t/b.yml"
  if ! docker compose -f "$t/a.yml" -f "$t/b.yml" config >/dev/null 2>&1; then
    rm -rf "$t"
    die "Слишком старая версия docker compose ($(docker compose version --short 2>/dev/null)). Нужна 2.24 или новее."
  fi
  rm -rf "$t"
}

# Бан IP после нескольких неверных паролей SSH — от ботов, перебирающих пароли.
setup_fail2ban() {
  mkdir -p /etc/fail2ban/jail.d
  cat > /etc/fail2ban/jail.d/md-trans.conf <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 6
findtime = 10m
bantime = 1h
EOF
  systemctl enable fail2ban >/dev/null 2>&1 || true
  systemctl restart fail2ban >/dev/null 2>&1 || warn "fail2ban не запустился — на работу сервиса это не влияет."
}

prepare_system() {
  if [ -n "${MDTRANS_SKIP_SYSTEM:-}" ]; then
    info "Тестовый режим: систему не трогаю"
    return 0
  fi
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in
    ubuntu|debian) ;;
    *) die "Нужен Ubuntu 24.04 (или 22.04). На этом сервере: ${PRETTY_NAME:-неизвестная система}." ;;
  esac
  log "Устанавливаю нужные программы"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -qq -y git curl openssl jq ca-certificates gnupg fail2ban python3-systemd >/dev/null
  ensure_swap
  install_docker
  configure_docker
  setup_fail2ban
}

# --- Supabase ----------------------------------------------------------------

# Официальный установщик Supabase: скачивает сборку нужной версии и
# генерирует все пароли и ключи в .env.
setup_supabase() {
  if [ -f "$SUPABASE_DIR/.env" ]; then
    info "Supabase уже скачан в $SUPABASE_DIR"
    return 0
  fi
  log "Скачиваю официальную сборку Supabase ($SUPABASE_RELEASE) и генерирую ключи"
  local tmp
  tmp=$(mktemp -d)
  curl -fsSL "https://raw.githubusercontent.com/supabase/supabase/refs/tags/$SUPABASE_RELEASE/docker/setup.sh" -o "$tmp/setup.sh" \
    || die "Не удалось скачать установщик Supabase с GitHub. Проверьте интернет на сервере и повторите."
  mkdir -p "$(dirname "$SUPABASE_DIR")"
  # Официальный установщик печатает все сгенерированные пароли и ключи — на
  # экране их прячем (строки вида КЛЮЧ=значение), чтобы они не попали в
  # скриншот или в сообщение в чат. Сами ключи сохраняются в .env.
  (cd "$(dirname "$SUPABASE_DIR")" && sh "$tmp/setup.sh" -y --skip-deps --ref "$SUPABASE_RELEASE" --project-dir "$(basename "$SUPABASE_DIR")") 2>&1 \
    | sed -u -E 's/^([A-Z][A-Z0-9_]*)=.+$/\1=(скрыто)/' \
    || die "Официальная установка Supabase завершилась с ошибкой (текст выше). Запустите install.sh ещё раз; если повторится — пришлите Claude текст ошибки."
  rm -rf "$tmp"
  [ -f "$SUPABASE_DIR/.env" ] || die "После установки Supabase нет файла $SUPABASE_DIR/.env."
}

# Страховка: если официальный установщик оборвался после создания .env, но
# до генерации ключей, в .env остались общеизвестные пароли из примера.
ensure_secrets() {
  local jwt pg
  jwt=$(env_get JWT_SECRET)
  pg=$(env_get POSTGRES_PASSWORD)
  case "$jwt" in your-super-secret-jwt-token*) ;; *)
    case "$pg" in your-super-secret-and-long-postgres-password) ;; *) return 0 ;; esac ;;
  esac
  if [ -n "$(ls -A "$SUPABASE_DIR/volumes/db/data" 2>/dev/null)" ]; then
    die "В $SUPABASE_DIR/.env пароли из примера, а база уже создана. Сервер не запущен; напишите Claude — нужна ручная правка."
  fi
  log "Генерирую пароли и ключи сервера"
  (cd "$SUPABASE_DIR" && sh utils/generate-keys.sh --update-env >/dev/null && sh utils/add-new-auth-keys.sh --update-env >/dev/null)
}

# --- Аккаунты ----------------------------------------------------------------

# Создаёт пользователя в Supabase Auth через Admin API (как create-account).
# Печатает его id. Пароль уходит в curl через stdin, а не в аргументах.
create_auth_user() {
  local phone="$1" email="$2" password="$3" key body resp code
  key=$(env_get SERVICE_ROLE_KEY)
  body=$(jq -n --arg phone "$phone" --arg email "$email" --arg password "$password" \
    '{email: $email, password: $password, email_confirm: true}
     + (if $phone == "" then {} else {phone: $phone, phone_confirm: true} end)')
  resp=$(printf '%s' "$body" | curl -sS -w '\n%{http_code}' -X POST "http://127.0.0.1:8000/auth/v1/admin/users" \
    -H "apikey: $key" -H "Authorization: Bearer $key" -H 'Content-Type: application/json' --data-binary @-) || return 1
  code=$(printf '%s' "$resp" | tail -n1)
  resp=$(printf '%s' "$resp" | sed '$d')
  case "$code" in
    200|201) printf '%s' "$resp" | jq -r '.id' ;;
    *) printf 'Supabase Auth ответил %s: %s\n' "$code" "$resp" >&2; return 1 ;;
  esac
}

bootstrap_accounts() {
  if [ "$(config_get accounts_created)" = "yes" ]; then
    return 0
  fi
  local admin_id owner_id
  if [ "$(db_psql -tA -c "select count(*) from employees where role = 'admin'")" = "0" ]; then
    log "Создаю компанию «$MDTRANS_COMPANY» и вход администратора"
    admin_id=$(create_auth_user "$ADMIN_E164" "${ADMIN_E164#+}@mdtrans.internal" "$MDTRANS_ADMIN_PASSWORD") \
      || die "Не удалось создать вход администратора (ответ сервера выше)."
    db_psql -v company="$MDTRANS_COMPANY" -v cid="$FIRST_COMPANY_ID" -v uid="$admin_id" \
      -v name="$MDTRANS_ADMIN_NAME" -v phone="$(phone_pretty "$ADMIN_E164")" >/dev/null <<'SQL'
update companies set name = :'company' where id = :'cid';
insert into employees (auth_user_id, company_id, name, phone, role, account_status,
  can_manage_orders, can_view_client_stats, can_view_contacts_and_amounts, can_manage_own_schedule)
values (:'uid', :'cid', :'name', :'phone', 'admin', 'active', true, true, true, true);
SQL
  fi
  if [ "$(db_psql -tA -c "select count(*) from employees where role = 'owner'")" = "0" ]; then
    log "Создаю вход владельца сервиса (логин owner)"
    owner_id=$(create_auth_user "" "owner@mdtrans.internal" "$MDTRANS_OWNER_PASSWORD") \
      || die "Не удалось создать вход владельца (ответ сервера выше)."
    db_psql -v uid="$owner_id" -v name="${MDTRANS_ADMIN_NAME:-Владелец}" >/dev/null <<'SQL'
insert into employees (auth_user_id, company_id, name, role, account_status,
  can_manage_orders, can_view_client_stats, can_view_contacts_and_amounts)
values (:'uid', null, :'name', 'owner', 'active', false, false, false);
SQL
  fi
  config_set accounts_created yes
  config_set admin_phone "$(phone_pretty "$ADMIN_E164")"
}

# --- Резервные копии -----------------------------------------------------------

setup_cron() {
  [ -n "${MDTRANS_SKIP_SYSTEM:-}" ] && return 0
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  cat > /etc/cron.d/md-trans-backup <<EOF
# Резервная копия базы, фото и ключей «Грузоперевозок» — каждую ночь (deploy/selfhost/backup.sh).
30 0 * * * root bash $MDTRANS_REPO/deploy/selfhost/backup.sh >> $BACKUP_DIR/backup.log 2>&1
EOF
  cat > /etc/cron.d/md-trans-app <<EOF
# Новая сборка приложения для телефонов — на страницу установки, раз в час (deploy/selfhost/publish-app.sh).
23 * * * * root bash $MDTRANS_REPO/deploy/selfhost/publish-app.sh >> $MDTRANS_BASE/publish-app.log 2>&1
EOF
  chmod 644 /etc/cron.d/md-trans-backup /etc/cron.d/md-trans-app
}

# --- Проверка и итог ---------------------------------------------------------

check_health() {
  local anon
  anon=$(env_get ANON_KEY)
  log "Проверяю, что сервер отвечает"
  wait_http_ok "http://127.0.0.1:8000/auth/v1/health" "$anon" 60 \
    || die "API сервера не отвечает. Состояние: cd $SUPABASE_DIR && sh run.sh status"
  info "Изнутри сервера — работает"
  HTTPS_OK=""
  if wait_http_ok "https://api.$DOMAIN/auth/v1/health" "$anon" 120; then
    info "https://api.$DOMAIN — работает"
    HTTPS_OK=1
  else
    warn "https://api.$DOMAIN пока не отвечает. Почти всегда это значит, что DNS-запись api.$DOMAIN ещё не указывает на этот сервер. Как только запись заработает, Caddy сам получит сертификат — ничего перезапускать не нужно."
  fi
}

print_summary() {
  local anon admin_phone
  anon=$(env_get ANON_KEY)
  admin_phone=$(config_get admin_phone)
  cat <<EOF

==============================================================================
  Сервер установлен
==============================================================================

Адрес сервера для приложений:
  https://api.$DOMAIN

Публичный ключ (anon key) — не секрет, он всё равно зашит в приложение:
  $anon

Эти две строки (адрес и ключ) пришлите Claude в проект — по ним он соберёт
приложения для телефонов с этим сервером.

Веб-кабинет: https://$DOMAIN
Вход администратора — телефон ${admin_phone:-(тот, что вы ввели)} и ваш пароль.
Кабинет владельца сервиса — на том же сайте, «Войти по логину или email»,
логин owner.

Все пароли и секретные ключи сервера — в файле $SUPABASE_DIR/.env.
Никому его не пересылайте и не вставляйте в чат.

Обновить сервер до новой версии (одна строка):
  bash $MDTRANS_REPO/deploy/selfhost/update.sh
EOF
  if [ -z "${HTTPS_OK:-}" ]; then
    printf '\nHTTPS пока не заработал — проверьте DNS-записи домена (см. предупреждение выше).\n'
  fi
}

main() {
  require_root
  mkdir -p "$MDTRANS_BASE"
  take_lock -n || die "Установка или обновление уже идёт в другом окне — дождитесь, пока оно закончится."
  printf '\nУстановка сервера «Грузоперевозок». Сначала несколько вопросов — дальше\n'
  printf 'всё пойдёт само, обычно 15–30 минут. Окно не закрывайте.\n'
  ask_questions
  check_dns
  prepare_system

  config_set domain "$DOMAIN"
  [ -n "$(config_get branch)" ] || config_set branch "$MDTRANS_DEFAULT_BRANCH"
  grep -q '^web_branch=' "$MDTRANS_CONFIG" || config_set web_branch "$MDTRANS_DEFAULT_WEB_BRANCH"

  setup_supabase
  ensure_secrets
  log "Настраиваю сервер под «Грузоперевозки»"
  apply_config "$DOMAIN"
  deploy_functions || true
  start_stack
  # Контейнер функций мог уже работать со старыми файлами (повторный запуск).
  compose restart functions >/dev/null
  tune_database

  log "Накатываю миграции базы"
  run_migrations
  bootstrap_accounts

  if [ -z "${MDTRANS_SKIP_WEB:-}" ]; then
    log "Веб-кабинет"
    deploy_web
    publish_app_files "$MDTRANS_REPO/deploy/app-release.json"
  fi
  setup_cron
  check_health
  print_summary
}

main "$@"
exit $?
