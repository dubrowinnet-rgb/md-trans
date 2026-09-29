#!/usr/bin/env bash
# Перенос данных из облачного Supabase на свой сервер: компании,
# сотрудники вместе с их входами и паролями, клиенты, заказы, графики,
# отчёты водителей и фото одометра. Запуск на новом сервере после
# install.sh (одна строка):
#   bash /opt/md-trans/repo/deploy/selfhost/import-from-cloud.sh
#
# Всё, что уже есть в базе ЭТОГО сервера, заменяется данными из облака — в
# том числе администратор и владелец, которых завёл установщик: после
# переноса входят прежними телефоном (или логином) и паролем. Облачный
# проект скрипт только читает. Запускать можно повторно — например,
# пробный перенос заранее и окончательный в день переезда.
#
# Как устроено: в облаке миграции могли быть выполнены не все (скажем, до
# 0015). База сервера создаётся заново и доводится ровно до того же номера,
# данные переносятся один в один (в одной транзакции, без триггеров), и
# только потом накатываются остальные миграции — так их изменения данных
# (например, права водителей в 0016) применяются и к перенесённым строкам.
#
# Для проверки на тестовой машине ответы можно передать переменными
# MDTRANS_IMPORT_CONFIRM=да, MDTRANS_CLOUD_DB_URL, MDTRANS_CLOUD_DB_PASSWORD
# (к тестовой базе без SSL — строка с ?sslmode=disable на конце).

set -euo pipefail

self_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
. "$self_dir/lib.sh"

# Миграция, начиная с которой схема облака совпадает с нашей (компании и
# владелец сервиса) — раньше неё переносить нечего.
MIN_CLOUD_LEVEL=13
PHOTO_BUCKET="odometer-photos"
# Публичная ссылка на фото в Storage (как её сохраняет приложение); в
# скобках — имя файла в бакете.
PHOTO_URL_RE='^https?://[^/]+/storage/v1/object/public/odometer-photos/(.+)$'

CLOUD_CONNINFO=""
CLOUD_PASSWORD=""
# Папка с выгрузкой: в ней персональные данные и хэши паролей — удаляется
# при любом завершении скрипта.
IMPORT_DIR=""
cleanup() { [ -z "$IMPORT_DIR" ] || rm -rf "$IMPORT_DIR"; }
trap cleanup EXIT
trap 'exit 1' INT TERM HUP

# psql к облачной базе. Пароль передаётся через окружение docker exec, а не
# в аргументах — его не видно в списке процессов.
cloud_psql() {
  PGPASSWORD="$CLOUD_PASSWORD" docker exec -i -e PGPASSWORD supabase-db \
    psql "$CLOUD_CONNINFO" -X -q -v ON_ERROR_STOP=1 "$@"
}

# psql к базе этого сервера под суперпользователем: только он видит все
# таблицы входа (auth) и может отключить триггеры на время переноса.
admin_psql() {
  docker exec -i -e PGOPTIONS='-c client_min_messages=warning' supabase-db \
    psql -X -q -v ON_ERROR_STOP=1 -U supabase_admin -d postgres "$@"
}

# Строка подключения из Supabase Dashboard (Connect → Session pooler) →
# параметры для psql. Пароль в строке может быть заглушкой [YOUR-PASSWORD].
# Разбор свой, не urllib: квадратные скобки заглушки новые версии Python
# принимают за адрес IPv6 и отказываются разбирать строку.
parse_connection() {
  local out
  out=$(python3 - "$1" 2>/dev/null <<'PY'
import re, sys
from urllib.parse import parse_qs, unquote
s = sys.argv[1].strip().strip('"').strip("'")
m = re.fullmatch(r"postgres(?:ql)?://(.*)", s, re.S)
if not m:
    sys.exit(1)
userinfo, at, hostpart = m.group(1).rpartition("@")
h = re.fullmatch(r"([A-Za-z0-9._-]+)(?::(\d+))?(?:/([^?#]*))?(?:\?([^#]*))?", hostpart)
if not h:
    sys.exit(1)
host, port, db, query = h.groups()
user, _, password = userinfo.partition(":")
user = unquote(user) or "postgres"
password = unquote(password)
if password.startswith("[") and password.endswith("]"):
    password = ""
db = unquote(db or "") or "postgres"
sslmode = parse_qs(query or "").get("sslmode", ["require"])[0]
for v in (user, db, sslmode):
    if not re.fullmatch(r"[A-Za-z0-9._-]+", v):
        sys.exit(1)
print(f"host={host} port={port or 5432} user={user} dbname={db} sslmode={sslmode} connect_timeout=15")
print(password)
PY
  ) || return 1
  CLOUD_CONNINFO=$(printf '%s\n' "$out" | sed -n 1p)
  CLOUD_PASSWORD=$(printf '%s\n' "$out" | sed -n 2p)
}

ask_password_once() {
  printf 'Пароль облачной базы (при вводе не виден): ' >/dev/tty
  IFS= read -r -s CLOUD_PASSWORD </dev/tty || die "Не удалось прочитать ответ."
  printf '\n' >/dev/tty
}

ask_connection() {
  local uri="${MDTRANS_CLOUD_DB_URL:-}"
  say ""
  say "Строка подключения к облачной базе: Supabase Dashboard → ваш проект →"
  say "кнопка «Connect» вверху → «Session pooler» → скопируйте строку, которая"
  say "начинается с postgresql:// (вместе с [YOUR-PASSWORD] — пароль спрошу"
  say "отдельно)."
  while :; do
    ask uri "Строка подключения"
    parse_connection "$uri" && break
    say "  Это не похоже на строку подключения — она начинается с postgresql://"
    uri=""
  done
  CLOUD_PASSWORD="${MDTRANS_CLOUD_DB_PASSWORD:-$CLOUD_PASSWORD}"
  if [ -z "$CLOUD_PASSWORD" ]; then
    say "Пароль базы — тот, что задавали при создании проекта. Если не помните:"
    say "Dashboard → Project Settings → Database → Reset database password."
    ask_password_once
  fi
  [ -n "$CLOUD_PASSWORD" ] || die "Пароль не введён."
}

# Проверяет подключение; при неверном пароле даёт ввести его ещё раз.
connect_cloud() {
  local attempt err
  for attempt in 1 2 3; do
    log "Подключаюсь к облачной базе"
    err=$(cloud_psql -tA -c "select 1" 2>&1 >/dev/null) && return 0
    info "Не получилось: $err"
    case "$err" in
      *"password authentication failed"*)
        say "Неверный пароль. Если не помните его: Dashboard → Project Settings → Database → Reset database password."
        if [ -z "${MDTRANS_CLOUD_DB_PASSWORD:-}" ] && [ "$attempt" -lt 3 ]; then
          ask_password_once
          continue
        fi ;;
      *"Tenant or user not found"*|*"could not translate host name"*|*"Network is unreachable"*)
        say "Проект не найден или недоступен. Скопируйте ещё раз строку именно «Session pooler» (не «Direct connection»); если проект на паузе (Paused) — нажмите в Dashboard «Restore project» и подождите несколько минут." ;;
    esac
    break
  done
  die "Не удалось подключиться к облачной базе (ошибка выше). Здесь ничего не изменено."
}

# До какой миграции дошла облачная база — по объектам, которые создаёт
# каждая миграция начиная с 0013. Печатает номер (0, если нет даже 0013).
# Новую миграцию, которую могут выполнить и в облаке, добавляйте сюда
# (иначе её поля при переносе пропадут, а новые значения могут не пройти
# проверки старой схемы).
detect_cloud_level() {
  cloud_psql -tA <<'SQL'
select case
  when exists (select 1 from pg_proc where proname = 'claim_crew_reminders') then 20
  when exists (select 1 from pg_proc where proname = 'save_driver_report') then 19
  when to_regclass('private.app_settings') is not null then 18
  when exists (select 1 from pg_proc where proname = 'restrict_employee_self_role_change'
               and pg_get_functiondef(oid) like '%can_edit_order_schedule_and_price is distinct from%') then 17
  when exists (select 1 from pg_proc where proname = 'recent_addresses') then 16
  when exists (select 1 from pg_trigger where tgname = 'orders_notify_changed') then 15
  when to_regclass('public.driver_reports') is not null then 14
  when to_regclass('public.companies') is not null then 13
  else 0
end;
SQL
}

# Таблицы схемы public — через пробел.
tables_of() {
  "$1" -tA <<'SQL'
select coalesce(string_agg(c.relname, ' ' order by c.relname), '')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition;
SQL
}

# Список столбцов таблицы (без вычисляемых) — через запятую, в кавычках.
columns_of() {
  local psql_fn="$1" schema="$2" table="$3"
  "$psql_fn" -tA -v schema="$schema" -v tbl="$table" <<'SQL'
select coalesce(string_agg(quote_ident(column_name), ', ' order by ordinal_position), '')
from information_schema.columns
where table_schema = :'schema' and table_name = :'tbl' and is_generated = 'NEVER';
SQL
}

# Столбцы, которые есть и в облаке, и здесь (в порядке облака). Столбцы
# только из облака — с предупреждением: у нас их нет ни в одной миграции
# (у таблиц входа — другая версия сервиса входа, это нормально).
common_columns() {
  local schema="$1" table="$2" cloud here
  cloud=$(columns_of cloud_psql "$schema" "$table")
  here=$(columns_of admin_psql "$schema" "$table")
  CLOUD="$cloud" HERE="$here" SCHEMA="$schema" TABLE="$table" python3 -c '
import os, sys
here = {c.strip() for c in os.environ["HERE"].split(",") if c.strip()}
cloud = [c.strip() for c in os.environ["CLOUD"].split(",") if c.strip()]
extra = [c for c in cloud if c not in here]
if extra and os.environ["SCHEMA"] == "public":
    print("\nВНИМАНИЕ: в облаке у таблицы %s есть столбцы, которых нет в миграциях: %s — их не переношу."
          % (os.environ["TABLE"], ", ".join(extra)), file=sys.stderr)
print(", ".join(c for c in cloud if c in here))'
}

# Выгружает таблицу из облака в файл (формат COPY). $4 — столбцы.
export_table() {
  local schema="$1" table="$2" file="$3" cols="$4"
  cloud_psql -c "\\copy (select $cols from $schema.$table) to stdout" > "$file"
}

rows() { wc -l < "$1" | tr -d ' '; }

# Очищает базу этого сервера и создаёт её заново (как при установке). .env
# с ключами остаётся прежним, поэтому адрес и ключ для приложений не меняются.
reset_database() {
  log "Создаю базу этого сервера заново"
  compose down >/dev/null 2>&1 || compose down
  rm -rf "$SUPABASE_DIR/volumes/db/data"
  start_stack
}

# Фото одометра: в отчётах хранятся полные публичные ссылки на облачный
# Storage. Каждое фото скачивается по своей ссылке и загружается в Storage
# этого сервера под тем же именем. $2 — файл «ссылка<TAB>имя».
copy_photos() {
  local dir="$1" list="$2" count=0 failed=0 url name mime key
  log "Переношу фото одометра ($(rows "$list") шт.)"
  key=$(env_get SERVICE_ROLE_KEY)
  while IFS=$'\t' read -r url name; do
    [ -n "$url" ] || continue
    if ! mime=$(curl -fsS --retry 2 --max-time 120 -o "$dir/photo" -w '%{content_type}' "$url" 2>"$dir/curl.err"); then
      info "не скачалось из облака: $name ($(tail -n1 "$dir/curl.err"))"
      failed=$((failed + 1))
    elif ! curl -fsS --max-time 120 -o /dev/null -X POST "http://127.0.0.1:8000/storage/v1/object/$PHOTO_BUCKET/$name" \
        -H "apikey: $key" -H "Authorization: Bearer $key" -H "Content-Type: ${mime%%;*}" -H "x-upsert: true" \
        --data-binary @"$dir/photo" 2>"$dir/curl.err"; then
      info "не загрузилось на сервер: $name ($(tail -n1 "$dir/curl.err"))"
      failed=$((failed + 1))
    else
      count=$((count + 1))
    fi
  done < "$list"
  rm -f "$dir/photo" "$dir/curl.err"
  info "Перенесено: $count, не удалось: $failed"
  [ "$failed" = "0" ] || warn "Часть фото не перенеслась — у этих отчётов фото не откроется. Можно запустить перенос ещё раз."
}

main() {
  require_root
  local domain
  domain=$(config_get domain)
  [ -f "$SUPABASE_DIR/.env" ] && [ -n "$domain" ] \
    || die "Сервер ещё не установлен — сначала install.sh (deploy/selfhost/README.md)."
  case "$domain" in *[!a-z0-9.-]*) die "Странный домен в $MDTRANS_CONFIG: $domain" ;; esac
  take_lock -w 600 || die "Идёт установка или обновление — дождитесь, пока оно закончится."

  say ""
  say "Перенос данных из облачного Supabase на этот сервер."
  say "Всё, что сейчас есть в базе ЭТОГО сервера, будет заменено данными из"
  say "облака. Облачный проект не меняется. После переноса входите прежними"
  say "телефоном (или логином) и паролем."
  ask MDTRANS_IMPORT_CONFIRM "Продолжить? Напишите да"
  case "${MDTRANS_IMPORT_CONFIRM// /}" in
    да|Да|ДА|yes|y) ;;
    *) die "Перенос отменён." ;;
  esac

  ask_connection
  connect_cloud

  local level dir cloud_tables known_tables tables="" table cols count mismatch="" photos=""
  level=$(detect_cloud_level)
  [ "$level" -ge "$MIN_CLOUD_LEVEL" ] \
    || die "В облачной базе не выполнена миграция 0013 (компании) — переносить из неё не получится. Напишите Claude."
  info "В облаке выполнены миграции до $(printf '%04d' "$level")"

  mkdir -p "$MDTRANS_BASE/import"
  chmod 700 "$MDTRANS_BASE/import"
  dir="$MDTRANS_BASE/import/$(date +%Y-%m-%d_%H-%M-%S)"
  mkdir "$dir"
  IMPORT_DIR="$dir"

  # 1. Выгрузка из облака — пока база этого сервера не тронута: если
  # что-то пойдёт не так, здесь ничего не изменится.
  log "Выгружаю данные из облака"
  known_tables=" $(tables_of admin_psql) "
  cloud_tables=$(tables_of cloud_psql)
  for table in $cloud_tables; do
    case "$known_tables" in
      *" $table "*) tables="$tables $table" ;;
      *) warn "Таблица $table есть только в облаке (её нет в миграциях) — не переношу." ;;
    esac
  done
  case " $tables " in
    *" employees "*) ;;
    *) die "В облачной базе нет таблицы сотрудников — это точно проект «Грузоперевозок»?" ;;
  esac
  for table in $tables; do
    cols=$(common_columns public "$table")
    printf '%s\n' "$cols" > "$dir/public.$table.cols"
    export_table public "$table" "$dir/public.$table.copy" "$cols"
    info "$table: $(rows "$dir/public.$table.copy")"
  done
  for table in users identities; do
    cols=$(common_columns auth "$table")
    [ -n "$cols" ] || die "Не удалось сопоставить таблицу auth.$table — напишите Claude."
    printf '%s\n' "$cols" > "$dir/auth.$table.cols"
    export_table auth "$table" "$dir/auth.$table.copy" "$cols"
    info "входы (auth.$table): $(rows "$dir/auth.$table.copy")"
  done
  chmod 600 "$dir"/*
  if [ "$(rows "$dir/public.employees.copy")" = "0" ] || [ "$(rows "$dir/auth.users.copy")" = "0" ]; then
    die "В облачной базе нет ни одного сотрудника — переносить нечего (это точно тот проект?). Здесь ничего не изменено."
  fi
  case " $tables " in
    *" driver_reports "*)
      cloud_psql -tA -F $'\t' > "$dir/photos.tsv" <<SQL
select distinct odometer_photo_url, substring(odometer_photo_url from '$PHOTO_URL_RE')
from public.driver_reports
where odometer_photo_url ~ '$PHOTO_URL_RE';
SQL
      [ -s "$dir/photos.tsv" ] && photos=1 ;;
  esac

  # 2. Копия нынешнего состояния сервера — на всякий случай.
  bash "$MDTRANS_REPO/deploy/selfhost/backup.sh"

  # 3. Чистая база ровно на уровне облака.
  reset_database
  log "Довожу базу до уровня облака (миграции до $(printf '%04d' "$level"))"
  run_migrations "$level"

  # 4. Данные — одной транзакцией, без триггеров и проверок ссылок (порядок
  # таблиц тогда не важен, а пуши и напоминания не срабатывают). Строки,
  # которые создали сами миграции (стартовые услуги, первая компания), —
  # удаляем: в облаке они уже есть со своими id.
  log "Загружаю данные"
  {
    printf 'set session_replication_role = replica;\n'
    printf 'truncate table %s cascade;\n' "$(tables_of admin_psql | sed 's/ /, /g')"
    printf 'delete from auth.identities;\ndelete from auth.users;\n'
    for table in $tables; do
      printf 'copy public.%s (%s) from stdin;\n' "$table" "$(cat "$dir/public.$table.cols")"
      cat "$dir/public.$table.copy"
      printf '\\.\n'
    done
    for table in users identities; do
      printf 'copy auth.%s (%s) from stdin;\n' "$table" "$(cat "$dir/auth.$table.cols")"
      cat "$dir/auth.$table.copy"
      printf '\\.\n'
    done
    # Сервис входа не принимает NULL в служебных полях (пишет туда пустую
    # строку) — вход падал бы с ошибкой. Новые версии облака могут хранить
    # NULL — приводим к виду, который понимает версия этого сервера.
    cat <<'SQL'
do $$
declare c text;
begin
  foreach c in array array['confirmation_token', 'recovery_token', 'email_change_token_new',
    'email_change_token_current', 'email_change', 'phone_change', 'phone_change_token', 'reauthentication_token'] loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'auth' and table_name = 'users' and column_name = c) then
      execute format('update auth.users set %I = %L where %I is null', c, '', c);
    end if;
  end loop;
end $$;
SQL
    # Push-токены облака принадлежат старому приложению (Expo Go) — новое
    # зарегистрирует свои при первом входе.
    printf 'update public.employees set expo_push_token = null where expo_push_token is not null;\n'
    # Ссылки на фото одометра вели на облако — теперь на этот сервер.
    if [ -n "$photos" ]; then
      printf "update public.driver_reports set odometer_photo_url = regexp_replace(odometer_photo_url, '^https?://[^/]+/storage/v1/', 'https://api.%s/storage/v1/') where odometer_photo_url ~ '%s';\n" \
        "$domain" "$PHOTO_URL_RE"
    fi
    # Вход по телефону (0016): аккаунтам, заведённым ещё по логину, телефон
    # для входа прописывало само приложение при следующем запуске — в новом
    # приложении прежнего входа нет, поэтому прописываем сразу (как
    # update-account: +7 и 10 цифр, телефон подтверждён). Повторяющиеся
    # номера пропускаем — их администратор поправит в «Команде».
    cat <<'SQL'
with candidates as (
  select u.id,
         '7' || case when length(d) = 11 then right(d, 10) else d end as phone
  from auth.users u
  join (select auth_user_id, regexp_replace(coalesce(phone, ''), '\D', '', 'g') as d from public.employees) e
    on e.auth_user_id = u.id
  where coalesce(u.phone, '') = ''
    and (length(d) = 10 or (length(d) = 11 and left(d, 1) in ('7', '8')))
)
update auth.users u
set phone = c.phone, phone_confirmed_at = coalesce(u.phone_confirmed_at, now())
from candidates c
where u.id = c.id
  and (select count(*) from candidates c2 where c2.phone = c.phone) = 1
  and not exists (select 1 from auth.users o where o.phone = c.phone);
SQL
  } | admin_psql --single-transaction >/dev/null \
    || die "Данные не загрузились (база этого сервера пустая, облако не изменилось). Пришлите Claude текст ошибки выше — или запустите перенос ещё раз."

  # 5. Остальные миграции — теперь уже с перенесёнными данными.
  log "Накатываю остальные миграции"
  run_migrations

  [ -z "$photos" ] || copy_photos "$dir" "$dir/photos.tsv"

  # Телефон администратора, который показывает install.sh при повторном
  # запуске, — теперь из перенесённых данных.
  config_set admin_phone "$(admin_psql -tA -c "select phone from public.employees where role = 'admin' and company_id = '$FIRST_COMPANY_ID' and phone is not null order by created_at limit 1")"

  # 6. Сверка: сколько строк в облаке и здесь.
  log "Сверяю"
  for table in $tables; do
    count=$(admin_psql -tA -c "select count(*) from public.$table")
    if [ "$(rows "$dir/public.$table.copy")" != "$count" ]; then
      info "$table: в облаке $(rows "$dir/public.$table.copy"), здесь $count"
      mismatch=1
    fi
  done
  count=$(admin_psql -tA -c "select count(*) from auth.users")
  if [ "$(rows "$dir/auth.users.copy")" != "$count" ]; then
    info "входы: в облаке $(rows "$dir/auth.users.copy"), здесь $count"
    mismatch=1
  fi
  if [ -n "$mismatch" ]; then
    warn "Количество строк не совпало (см. выше). Пришлите Claude этот вывод."
  else
    info "Все таблицы совпадают с облаком"
  fi

  local no_phone
  no_phone=$(admin_psql -tA -c "select count(*) from public.employees e join auth.users u on u.id = e.auth_user_id where e.role <> 'owner' and coalesce(u.phone, '') = ''")

  cat <<EOF

==============================================================================
  Данные перенесены
==============================================================================

Компаний: $(admin_psql -tA -c "select count(*) from public.companies"), сотрудников: $(admin_psql -tA -c "select count(*) from public.employees"), клиентов: $(admin_psql -tA -c "select count(*) from public.clients"), заказов: $(admin_psql -tA -c "select count(*) from public.orders").

Веб-кабинет: https://$domain — входите прежними телефоном и паролем.
Сотрудники входят в новое приложение так же: телефон и прежний пароль.
EOF
  if [ "$no_phone" != "0" ]; then
    cat <<EOF

У сотрудников без телефона или с повторяющимся номером ($no_phone) вход по
телефону не заработает: откройте их в «Команде», исправьте телефон и сохраните.
EOF
  fi
  cat <<EOF

Когда убедитесь, что всё на месте, удалите проект в Supabase Cloud:
Dashboard → Project Settings → General → Delete project.
Пока он не удалён, облако продолжает рассылать напоминания старому приложению.
EOF
}

main "$@"
exit $?
