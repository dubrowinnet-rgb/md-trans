#!/usr/bin/env bash
# Задать номер телефона для входа — когда у администратора или владельца
# сервиса аккаунт ещё заведён по старому логину (например owner) и телефона
# для входа у него нет, либо телефон для входа не тот, что нужен. Пароль не
# меняется. Запуск на сервере (одна строка):
#   bash /opt/md-trans/repo/deploy/selfhost/set-login-phone.sh
# Спросит текущий телефон или логин, покажет, чей это вход, и попросит
# новый номер телефона для входа. Остальное в аккаунте не меняется.

set -euo pipefail

self_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
. "$self_dir/lib.sh"

# Телефон в том виде, в каком его хранит Supabase Auth (7 и 10 цифр), или
# пусто, если введено не 10 значащих цифр (с кодом 7/8 или без).
phone_digits() {
  local d="${1//[^0-9]/}"
  case "${#d}" in
    10) printf '7%s' "$d" ;;
    11) case "$d" in [78]*) printf '7%s' "${d:1}" ;; esac ;;
  esac
}

main() {
  require_root
  [ -f "$SUPABASE_DIR/.env" ] || die "Сервер ещё не установлен — сначала install.sh (deploy/selfhost/README.md)."

  say ""
  say "Новый номер телефона для входа. Сначала укажите, чей это аккаунт —"
  say "телефон или логин, с которым человек ВХОДИТ сейчас (у владельца"
  say "сервиса логин owner, если у него ещё нет телефона для входа)."
  ask MDTRANS_PHONE_LOGIN "Текущий телефон или логин"

  local login="$MDTRANS_PHONE_LOGIN" phone email="" found uid uphone who new_digits new_e164 new_masked dup key body resp code
  phone=$(phone_digits "$login")
  if [ -z "$phone" ]; then
    email="$login"
    case "$email" in *@*) ;; *) email="$email@mdtrans.internal" ;; esac
  fi

  # Тот же поиск, что в reset-password.sh: по входу и по карточке сотрудника
  # (при переносе из облака номера во вход не всегда прописывались).
  found=$(db_psql -tA -F '|' -v phone="$phone" -v email="$email" <<'SQL'
select distinct u.id, coalesce(nullif(u.phone, ''), '-')
from auth.users u
left join employees e on e.auth_user_id = u.id
where (:'phone' <> '' and (u.phone = :'phone'
        or '7' || right(regexp_replace(coalesce(e.phone, ''), '\D', '', 'g'), 10) = :'phone'))
   or (:'email' <> '' and lower(u.email) = lower(:'email'));
SQL
)
  case "$(printf '%s' "$found" | grep -c .)" in
    0) die "Не нашёл вход с таким телефоном или логином. Проверьте и запустите ещё раз." ;;
    1) ;;
    *) die "Этот телефон указан у нескольких сотрудников — запустите ещё раз и введите логин." ;;
  esac
  IFS='|' read -r uid uphone <<<"$found"

  who=$(db_psql -tA -v uid="$uid" <<'SQL'
select e.name
       || ' — ' || case e.role when 'admin' then 'администратор' when 'dispatcher' then 'диспетчер'
                              when 'driver' then 'водитель' when 'loader' then 'грузчик'
                              when 'owner' then 'владелец сервиса' else e.role end
       || coalesce(', ' || c.name, '')
from employees e
left join companies c on c.id = e.company_id
where e.auth_user_id = :'uid'
limit 1;
SQL
)
  say "Нашёл: ${who:-вход без карточки сотрудника}"
  [ "$uphone" = "-" ] && say "Сейчас для входа по телефону у него номер не задан." || say "Сейчас для входа — номер $uphone."

  ask MDTRANS_PHONE_NEW "Новый номер телефона для входа (10 цифр, можно с +7 или 8)"
  new_digits=$(phone_digits "$MDTRANS_PHONE_NEW")
  [ -n "$new_digits" ] || die "Номер должен быть из 10 цифр (код города/оператора и номер). Запустите скрипт ещё раз."
  new_e164="+$new_digits"
  new_masked="+7(${new_digits:1:3})${new_digits:4:3}-${new_digits:7:2}-${new_digits:9:2}"

  # Этот номер не должен совпадать со входом ДРУГОГО сотрудника — иначе один
  # из двух перестанет входить (см. комментарий в update-account/index.ts про
  # случай после переноса из облака с задвоенными номерами).
  dup=$(db_psql -tA -v phone="$new_digits" -v uid="$uid" <<'SQL'
select 1 from auth.users where phone = :'phone' and id <> :'uid' limit 1;
SQL
)
  [ "$dup" = "1" ] && die "Этот номер уже используется для входа ДРУГИМ сотрудником — нельзя задать его ещё раз."

  say "Новый номер для входа: $new_masked. Пароль останется тот же, что сейчас."
  ask_yes MDTRANS_PHONE_CONFIRM "Сохранить? Напишите да или нет" || die "Телефон не менялся."

  key=$(env_get SERVICE_ROLE_KEY)
  body=$(jq -n --arg phone "$new_e164" '{phone: $phone, phone_confirm: true}')
  resp=$(printf '%s' "$body" | curl -sS -w '\n%{http_code}' -X PUT "http://127.0.0.1:8000/auth/v1/admin/users/$uid" \
    -H "apikey: $key" -H "Authorization: Bearer $key" -H 'Content-Type: application/json' --data-binary @-) \
    || die "Сервер входа не ответил. Проверьте, что сервер работает: cd $SUPABASE_DIR && sh run.sh status"
  code=$(printf '%s' "$resp" | tail -n1)
  case "$code" in
    200) ;;
    *) die "Supabase Auth ответил $code: $(printf '%s' "$resp" | sed '$d')" ;;
  esac

  # Карточка сотрудника — тот же номер, в привычном виде (+7(ХХХ)ХХХ-ХХ-ХХ),
  # чтобы в «Команде»/«Моём профиле» не осталось старого значения.
  db_psql -v uid="$uid" -v phone="$new_masked" <<'SQL' >/dev/null
update employees set phone = :'phone' where auth_user_id = :'uid';
SQL

  log "Готово: номер для входа изменён"
  info "Входите с номером $new_masked и прежним паролем."
}

main "$@"
exit $?
