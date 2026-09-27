# shellcheck shell=bash
# Общие функции для install.sh, update.sh, backup.sh, publish-app.sh и
# import-from-cloud.sh. Сам по себе не запускается — его подключают
# остальные скрипты (source).
#
# Раскладка на сервере:
#   /opt/md-trans/repo      — копия репозитория (миграции, функции, эти скрипты)
#   /opt/md-trans/web-repo  — копия ветки веб-кабинета, пока он в отдельной ветке
#   /opt/md-trans/supabase  — официальная сборка Supabase в Docker (+ .env с секретами)
#   /opt/md-trans/backups   — ежедневные резервные копии
#   /opt/md-trans/config    — домен и ветки, выбранные при установке
# Пути можно переопределить переменными окружения — это нужно только для
# проверки скриптов на тестовой машине.

MDTRANS_BASE="${MDTRANS_BASE:-/opt/md-trans}"
MDTRANS_REPO="${MDTRANS_REPO:-$MDTRANS_BASE/repo}"
MDTRANS_WEB_REPO="${MDTRANS_WEB_REPO:-$MDTRANS_BASE/web-repo}"
SUPABASE_DIR="${SUPABASE_DIR:-$MDTRANS_BASE/supabase}"
BACKUP_DIR="${BACKUP_DIR:-$MDTRANS_BASE/backups}"
MDTRANS_CONFIG="$MDTRANS_BASE/config"

MDTRANS_REPO_URL="${MDTRANS_REPO_URL:-https://github.com/dubrowinnet-rgb/md-trans}"
# Ветка сервера (миграции, функции, эти скрипты) и ветка веб-кабинета. Пока
# кабинет живёт в своей ветке, он скачивается отдельно; когда обе ветки
# сольют в main, в /opt/md-trans/config ставится branch=main и web_branch=
# (пусто) — тогда всё берётся из одной копии.
MDTRANS_DEFAULT_BRANCH="claude/project-thread-cbnmzl"
MDTRANS_DEFAULT_WEB_BRANCH="claude/project-thread-8z4luq"

# Версия официальной сборки Supabase, на которой всё проверено. Обновлять
# только вместе с проверкой миграций на новой версии.
SUPABASE_RELEASE="${MDTRANS_SUPABASE_REF:-self-hosted/v0.8.2}"

# Адрес Edge Functions изнутри Docker-сети — по нему база вызывает функции
# (pg_cron и триггеры, см. миграцию 0018).
FUNCTIONS_INTERNAL_URL="http://functions:9000"

# Первая компания, которую создаёт миграция 0013 (фиксированный id).
FIRST_COMPANY_ID="00000000-0000-0000-0000-000000000001"

log()  { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '\nВНИМАНИЕ: %s\n' "$*" >&2; }
die()  { printf '\nОШИБКА: %s\n' "$*" >&2; exit 1; }

require_root() {
  [ "$(id -u)" = "0" ] || die "Запустите скрипт от имени root (на сервере: sudo -i, затем команду ещё раз)."
}

# Пояснение к вопросам — в терминал (при установке без терминала, в тестовом
# режиме, — просто в stderr).
say() {
  { printf '%s\n' "$*" >/dev/tty; } 2>/dev/null || printf '%s\n' "$*" >&2
}

# ask ПЕРЕМЕННАЯ "Вопрос" [ответ по умолчанию] — пропускается, если значение
# уже задано (при повторном запуске или в тестовом режиме).
ask() {
  local var="$1" prompt="$2" def="${3:-}" reply
  [ -n "${!var:-}" ] && return 0
  while :; do
    if [ -n "$def" ]; then
      printf '%s [%s]: ' "$prompt" "$def" >/dev/tty
    else
      printf '%s: ' "$prompt" >/dev/tty
    fi
    IFS= read -r reply </dev/tty || die "Не удалось прочитать ответ."
    reply="${reply:-$def}"
    [ -n "$reply" ] && break
  done
  printf -v "$var" '%s' "$reply"
}

# Заменяет строку KEY=... в файле (или дописывает её в конец). awk, а не
# sed: в значениях бывают / | & — sed пришлось бы экранировать. Файл
# перезаписывается на месте, права (chmod 600 у .env) сохраняются.
set_kv() {
  local file="$1"
  touch "$file"
  K="$2" V="$3" awk 'BEGIN { k = ENVIRON["K"]; v = ENVIRON["V"]; done = 0 }
    index($0, k "=") == 1 { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }' "$file" > "$file.tmp"
  cat "$file.tmp" > "$file"
  rm -f "$file.tmp"
}

# Пустая строка, если ключа нет (без ошибки — скрипты работают с set -e).
get_kv() {
  [ -f "$1" ] || return 0
  K="$2=" awk 'BEGIN { k = ENVIRON["K"] } index($0, k) == 1 { sub(/\r$/, ""); print substr($0, length(k) + 1); exit }' "$1"
}

config_get() { get_kv "$MDTRANS_CONFIG" "$1"; }
config_set() { mkdir -p "$MDTRANS_BASE"; set_kv "$MDTRANS_CONFIG" "$1" "$2"; }
env_get()    { get_kv "$SUPABASE_DIR/.env" "$1"; }
env_set()    { set_kv "$SUPABASE_DIR/.env" "$1" "$2"; }

compose() {
  (cd "$SUPABASE_DIR" && docker compose "$@")
}

# Запускает все контейнеры Supabase и ждёт, пока они станут здоровыми.
start_stack() {
  log "Запускаю сервер (первый запуск — несколько минут)"
  if ! (cd "$SUPABASE_DIR" && sh run.sh start); then
    warn "Не все части сервера поднялись с первого раза — пробую ещё раз."
    sleep 15
    (cd "$SUPABASE_DIR" && sh run.sh start) \
      || die "Сервер не запустился. Посмотреть состояние: cd $SUPABASE_DIR && sh run.sh status — и пришлите Claude, что там написано."
  fi
}

# --- Репозиторий -----------------------------------------------------------

# Скачивает (или обновляет до последней версии) ветку репозитория в папку.
fetch_branch() {
  local dir="$1" branch="$2"
  if [ -d "$dir/.git" ]; then
    git -C "$dir" fetch -q --depth 1 origin "$branch" \
      || die "Не удалось скачать обновления с GitHub (ветка $branch). Проверьте интернет на сервере и повторите."
    git -C "$dir" reset -q --hard FETCH_HEAD
  else
    rm -rf "$dir"
    git clone -q --depth 1 --branch "$branch" "$MDTRANS_REPO_URL" "$dir" \
      || die "Не удалось скачать репозиторий с GitHub (ветка $branch). Проверьте интернет на сервере и повторите."
  fi
  info "$branch: $(git -C "$dir" log -1 --format='%h от %cd' --date=format:'%d.%m.%Y %H:%M')"
}

# --- База ------------------------------------------------------------------

# psql внутри контейнера базы под ролью postgres — той же, под которой
# миграции выполнялись в облачном SQL Editor.
db_psql() {
  # client_min_messages=warning — без служебных NOTICE вроде «already exists,
  # skipping»: они безобидны, но в выводе установки выглядят как ошибки.
  docker exec -i -e PGOPTIONS='-c client_min_messages=warning' supabase-db \
    psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}

# Накатывает все ещё не выполненные миграции из supabase/migrations по
# порядку. Какие уже выполнены — помнит таблица private.applied_migrations.
# Каждая миграция — в одной транзакции: если упала, база остаётся как до неё.
#   $1 — необязательно: номер последней миграции, до которой накатывать
#        (13 — до 0013 включительно; нужно переносу данных из облака).
run_migrations() {
  local upto="${1:-}" file name
  db_psql <<'SQL' >/dev/null
create schema if not exists private;
revoke all on schema private from public;
create table if not exists private.applied_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);
revoke all on private.applied_migrations from public;
SQL
  for file in "$MDTRANS_REPO"/supabase/migrations/*.sql; do
    name=$(basename "$file")
    case "$name" in
      *[!A-Za-z0-9_.-]*) die "Странное имя файла миграции: $name" ;;
    esac
    if [ -n "$upto" ] && [ "$((10#${name%%_*}))" -gt "$upto" ]; then
      break
    fi
    if [ "$(db_psql -tA -c "select 1 from private.applied_migrations where filename = '$name'")" = "1" ]; then
      continue
    fi
    info "Миграция $name"
    { cat "$file"; printf "\ninsert into private.applied_migrations (filename) values ('%s');\n" "$name"; } \
      | db_psql --single-transaction >/dev/null \
      || die "Миграция $name не выполнилась, база осталась как до неё. Пришлите Claude текст ошибки выше."
  done
  # Внутренний адрес функций для pg_cron и триггеров (миграция 0018).
  db_psql >/dev/null <<SQL
do \$\$ begin
  if to_regclass('private.app_settings') is not null then
    update private.app_settings set value = '$FUNCTIONS_INTERNAL_URL' where key = 'functions_base_url';
  end if;
end \$\$;
SQL
}

# --- Edge Functions --------------------------------------------------------

# Копирует функции из репозитория в папку, которую читает контейнер
# functions. Официальный роутер main не трогаем, пример hello убираем.
# Функции, которые из репозитория удалили, удаляются и с сервера — список
# развёрнутых хранится в .mdtrans-functions. Возвращает 0, если что-то
# изменилось (тогда контейнер functions нужно перезапустить).
deploy_functions() {
  local src="$MDTRANS_REPO/supabase/functions"
  local dst="$SUPABASE_DIR/volumes/functions"
  local manifest="$dst/.mdtrans-functions"
  local before after dir name
  before=$(cd "$dst" && find . -path ./main -prune -o -type f -print0 | sort -z | xargs -0 -r cat 2>/dev/null | md5sum)
  rm -rf "$dst/hello"
  if [ -f "$manifest" ]; then
    while IFS= read -r name; do
      if [ -n "$name" ] && [ "$name" != "main" ] && [ ! -d "$src/$name" ]; then
        rm -rf "${dst:?}/$name"
      fi
    done < "$manifest"
  fi
  : > "$manifest"
  for dir in "$src"/*/; do
    name=$(basename "$dir")
    [ "$name" = "main" ] && die "Функция не может называться main — это имя занято роутером Supabase."
    rm -rf "${dst:?}/$name"
    cp -r "$dir" "$dst/$name"
    echo "$name" >> "$manifest"
  done
  after=$(cd "$dst" && find . -path ./main -prune -o -type f -print0 | sort -z | xargs -0 -r cat 2>/dev/null | md5sum)
  [ "$before" != "$after" ]
}

# --- Настройки поверх официальной сборки -----------------------------------

# Приводит .env, Caddyfile и наш docker-compose override к нужному виду.
# Секреты (пароли, ключи) не трогает. Используется и при установке, и при
# каждом обновлении — чтобы новые настройки из репозитория доезжали сами.
apply_config() {
  local domain="$1"
  local here="$MDTRANS_REPO/deploy/selfhost"

  # API — на api.<домен>, веб-кабинет — на самом <домен> (deploy/web).
  env_set PROXY_DOMAIN "api.$domain"
  env_set SUPABASE_PUBLIC_URL "https://api.$domain"
  env_set API_EXTERNAL_URL "https://api.$domain/auth/v1"
  env_set WEB_DOMAIN "$domain"
  env_set SITE_URL "https://$domain"
  # Вход только по телефону и паролю, аккаунты заводит администратор
  # (функция create-account) — самостоятельная регистрация закрыта. Писем и
  # СМС сервер не отправляет, подтверждение не нужно.
  env_set DISABLE_SIGNUP true
  env_set ENABLE_PHONE_SIGNUP true
  env_set ENABLE_PHONE_AUTOCONFIRM true
  env_set ENABLE_EMAIL_SIGNUP true
  env_set ENABLE_EMAIL_AUTOCONFIRM true
  env_set ENABLE_ANONYMOUS_USERS false
  # Функции сами проверяют, кто их вызывает (create-account, update-account),
  # а внутренние (напоминания, пуши) закрыты снаружи в Caddyfile.
  env_set FUNCTIONS_VERIFY_JWT false
  # ИИ-помощник Studio отправляет данные в OpenAI — за границу. Выключен.
  env_set OPENAI_API_KEY ""
  env_set STUDIO_DEFAULT_ORGANIZATION "Грузоперевозки"
  env_set STUDIO_DEFAULT_PROJECT "Грузоперевозки"
  chmod 600 "$SUPABASE_DIR/.env"

  cp "$here/Caddyfile" "$SUPABASE_DIR/volumes/proxy/caddy/Caddyfile"
  cp "$here/docker-compose.mdtrans.yml" "$SUPABASE_DIR/docker-compose.mdtrans.yml"
  (cd "$SUPABASE_DIR" && sh run.sh config add caddy mdtrans >/dev/null)
}

# --- Веб-кабинет -----------------------------------------------------------

# Собирает и выкладывает веб-кабинет его же скриптом (deploy/web/setup-web.sh
# из ветки кабинета). Если в основной копии кабинета ещё нет — берёт его из
# отдельной ветки (web_branch в /opt/md-trans/config).
deploy_web() {
  local dir="" web_branch
  if [ -f "$MDTRANS_REPO/deploy/web/setup-web.sh" ] && [ -f "$MDTRANS_REPO/web/package.json" ]; then
    dir="$MDTRANS_REPO"
  else
    web_branch=$(config_get web_branch)
    if [ -n "$web_branch" ]; then
      fetch_branch "$MDTRANS_WEB_REPO" "$web_branch"
      [ -f "$MDTRANS_WEB_REPO/deploy/web/setup-web.sh" ] && dir="$MDTRANS_WEB_REPO"
    fi
  fi
  if [ -z "$dir" ]; then
    info "Веб-кабинета в этой версии нет — пропускаю."
    return 0
  fi
  sh "$dir/deploy/web/setup-web.sh" "$SUPABASE_DIR" \
    || warn "Веб-кабинет не собрался (API и приложения это не затрагивает). Пришлите Claude текст ошибки выше."
}

# --- Приложение для телефонов ------------------------------------------------

# Выкладывает последнюю сборку приложения на страницу «Установка приложения»
# веб-кабинета (https://<домен>/install/). Какая сборка последняя, написано в
# deploy/app-release.json (его обновляет тот, кто собирает приложение):
#   {
#     "android": { "version": "1.0.0 (3)", "url": "https://expo.dev/artifacts/eas/….apk", "sha256": "…" },
#     "ios": { "mode": "adhoc", "url": "https://expo.dev/…", "registerUrl": "https://expo.dev/register-device/…", "version": "1.0.0 (3)" }
#   }
# APK скачивается на свой сервер (files/md-trans.apk) — сотрудники качают его
# с вашего домена. Для iPhone ссылки передаются как есть: ставит приложение
# и регистрирует новый iPhone сам Expo. Страница читает files/install.json
# (формат — web/src/lib/installInfo.ts в ветке кабинета).
#   $1 — путь к app-release.json
publish_app_files() {
  local release="$1"
  local files="$SUPABASE_DIR/volumes/proxy/mdtrans/files"
  local apk_url apk_version apk_sha published android_mode="" tmp
  [ -f "$release" ] || return 0
  if [ ! -d "$files" ]; then
    info "Веб-кабинета на сервере нет — страницу установки приложения обновлять негде."
    return 0
  fi
  jq -e 'type == "object"' "$release" >/dev/null 2>&1 \
    || { warn "Файл сборок приложения повреждён ($release) — страницу установки не трогаю."; return 0; }

  apk_url=$(jq -r '.android.url // empty' "$release")
  apk_version=$(jq -r '.android.version // empty' "$release")
  apk_sha=$(jq -r '.android.sha256 // empty' "$release")
  published=$(config_get apk_published)
  if [ -n "$apk_url" ]; then
    if [ "$published" = "$apk_version $apk_url" ] && [ -f "$files/md-trans.apk" ]; then
      android_mode=local
    else
      info "Скачиваю приложение для Android, версия ${apk_version:-без номера}"
      if curl -fsSL --retry 3 --max-time 600 -o "$files/md-trans.apk.part" "$apk_url" \
        && { [ -z "$apk_sha" ] || printf '%s  %s\n' "$apk_sha" "$files/md-trans.apk.part" | sha256sum -c --status; }; then
        chmod 644 "$files/md-trans.apk.part"
        mv -f "$files/md-trans.apk.part" "$files/md-trans.apk"
        config_set apk_published "$apk_version $apk_url"
        android_mode=local
      else
        rm -f "$files/md-trans.apk.part"
        warn "Не удалось скачать APK — на странице установки будет прямая ссылка на сервер Expo. Следующая попытка — при следующей проверке."
        android_mode=remote
      fi
    fi
  fi

  tmp="$files/install.json.tmp"
  jq --arg mode "$android_mode" --arg url "$apk_url" --arg version "$apk_version" '{
      android: (if $mode == "local" then { url: "/files/md-trans.apk", version: $version }
                elif $mode == "remote" then { url: $url, version: $version }
                else null end),
      ios: (.ios // null)
    }' "$release" > "$tmp" || { rm -f "$tmp"; warn "Не удалось записать install.json."; return 0; }
  chmod 644 "$tmp"
  if cmp -s "$tmp" "$files/install.json"; then
    rm -f "$tmp"
  else
    mv -f "$tmp" "$files/install.json"
    info "Страница установки приложения обновлена"
  fi
}

# Не даёт обновлению сервера и ежечасной выкладке приложения работать
# одновременно. $1 — параметры flock: -n (не ждать) или -w <секунд>.
take_lock() {
  exec 9>"$MDTRANS_BASE/.lock"
  flock "$@" 9
}

# --- Проверки --------------------------------------------------------------

# Ждёт, пока адрес начнёт отвечать кодом 200 (до $3 секунд). Для
# https://*.localhost (проверка на тестовой машине) сертификат свой, -k.
wait_http_ok() {
  local url="$1" apikey="$2" timeout="${3:-60}" waited=0 code insecure=""
  case "$url" in https://*.localhost/*|https://localhost/*) insecure="-k" ;; esac
  while :; do
    code=$(curl -s $insecure -o /dev/null -w '%{http_code}' --max-time 10 -H "apikey: $apikey" "$url" || true)
    [ "$code" = "200" ] && return 0
    [ "$waited" -ge "$timeout" ] && return 1
    sleep 5
    waited=$((waited + 5))
  done
}
