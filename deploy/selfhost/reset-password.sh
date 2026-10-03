#!/usr/bin/env bash
# Новый пароль для входа — когда пароль забыт, а поменять его в приложении
# («Команда») некому: например, единственному администратору или владельцу
# сервиса. Запуск на сервере (одна строка):
#   bash /opt/md-trans/repo/deploy/selfhost/reset-password.sh
# Спросит телефон или логин, покажет, чей это вход, и попросит новый пароль
# (на экране он не виден). Остальное в аккаунте не меняется.

set -euo pipefail

self_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
. "$self_dir/lib.sh"

# Телефон в том виде, в каком его хранит Supabase Auth (7 и 10 цифр), или
# пусто, если введён не телефон.
phone_digits() {
  local d="${1//[^0-9]/}"
  case "${#d}" in
    10) printf '7%s' "$d" ;;
    11) case "$d" in [78]*) printf '7%s' "${d:1}" ;; esac ;;
  esac
}

# Пароль без эха на экране (в тестовом режиме — из MDTRANS_RESET_PASSWORD).
read_password() {
  local pw pw2
  if [ -n "${MDTRANS_RESET_PASSWORD:-}" ]; then
    printf '%s' "$MDTRANS_RESET_PASSWORD"
    return 0
  fi
  stty iutf8 2>/dev/null </dev/tty || true
  while :; do
    printf 'Новый пароль (не меньше 6 символов, на экране не виден): ' >/dev/tty
    IFS= read -rs pw </dev/tty || die "Не удалось прочитать пароль."
    printf '\n' >/dev/tty
    pw="${pw//[[:cntrl:]]/}"
    if [ "${#pw}" -lt 6 ]; then
      say "Слишком короткий — нужно не меньше 6 символов."
      continue
    fi
    printf 'Ещё раз тот же пароль: ' >/dev/tty
    IFS= read -rs pw2 </dev/tty || die "Не удалось прочитать пароль."
    printf '\n' >/dev/tty
    pw2="${pw2//[[:cntrl:]]/}"
    [ "$pw" = "$pw2" ] && break
    say "Пароли не совпали — введите ещё раз."
  done
  printf '%s' "$pw"
}

main() {
  require_root
  [ -f "$SUPABASE_DIR/.env" ] || die "Сервер ещё не установлен — сначала install.sh (deploy/selfhost/README.md)."

  say ""
  say "Новый пароль для входа. Укажите телефон, с которым человек входит в"
  say "приложение, или логин (у владельца сервиса логин owner)."
  ask MDTRANS_RESET_LOGIN "Телефон или логин"

  local login="$MDTRANS_RESET_LOGIN" phone email="" found uid uphone uconfirmed uemail uemail_confirmed confirm_phone="" confirm_email="" who pw key body resp code
  phone=$(phone_digits "$login")
  if [ -z "$phone" ]; then
    email="$login"
    case "$email" in *@*) ;; *) email="$email@mdtrans.internal" ;; esac
  fi

  # По телефону ищем и в самом входе, и в карточке сотрудника: при переносе
  # из облака повторяющиеся номера во вход не прописывались.
  found=$(db_psql -tA -F '|' -v phone="$phone" -v email="$email" <<'SQL'
select distinct u.id, coalesce(nullif(u.phone, ''), '-'), (u.phone_confirmed_at is not null),
       coalesce(u.email, ''), (u.email_confirmed_at is not null)
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
  IFS='|' read -r uid uphone uconfirmed uemail uemail_confirmed <<<"$found"
  # Вход по телефону или логину пускает только с подтверждённым номером или
  # адресом — подтверждаем заодно, если подтверждения нет.
  if [ "$uphone" != "-" ] && [ "$uconfirmed" = "f" ]; then
    confirm_phone=yes
  fi
  if [ -n "$uemail" ] && [ "$uemail_confirmed" = "f" ]; then
    confirm_email=yes
  fi

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
  ask_yes MDTRANS_RESET_CONFIRM "Поменять пароль этому человеку? Напишите да или нет" \
    || die "Пароль не менялся."

  pw=$(read_password)
  key=$(env_get SERVICE_ROLE_KEY)
  body=$(jq -n --arg password "$pw" --arg phone "$confirm_phone" --arg email "$confirm_email" \
    '{password: $password}
     + (if $phone == "yes" then {phone_confirm: true} else {} end)
     + (if $email == "yes" then {email_confirm: true} else {} end)')
  resp=$(printf '%s' "$body" | curl -sS -w '\n%{http_code}' -X PUT "http://127.0.0.1:8000/auth/v1/admin/users/$uid" \
    -H "apikey: $key" -H "Authorization: Bearer $key" -H 'Content-Type: application/json' --data-binary @-) \
    || die "Сервер входа не ответил. Проверьте, что сервер работает: cd $SUPABASE_DIR && sh run.sh status"
  code=$(printf '%s' "$resp" | tail -n1)
  case "$code" in
    200) ;;
    *) die "Supabase Auth ответил $code: $(printf '%s' "$resp" | sed '$d')" ;;
  esac

  log "Готово: пароль изменён"
  if [ "$uphone" != "-" ]; then
    info "Входите с тем же телефоном и новым паролем."
  else
    # Вход без телефона — только по логину (ссылка «Войти по логину или
    # email» на экране входа).
    info "Входите по логину ${uemail%@mdtrans.internal} и новому паролю — на экране входа ссылка «Войти по логину или email»."
  fi
}

main "$@"
exit $?
