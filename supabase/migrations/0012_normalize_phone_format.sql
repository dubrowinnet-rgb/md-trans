-- Единый формат телефона по всей базе (Максим, 2026-09-25):
-- +7(ХХХ)ХХХ-ХХ-ХХ — во всех уже сохранённых номерах клиентов и
-- сотрудников. Новые/изменённые номера с этого момента приложение и так
-- сохраняет в этом виде (mobile/src/lib/phone.ts, web/src/lib/phone.ts,
-- Edge Functions create-account/update-account) — эта миграция приводит к
-- тому же виду то, что уже лежало в базе раньше.
--
-- Логика 1:1 повторяет formatPhone/normalizePhone из mobile/src/lib/phone.ts:
-- убрать всё, кроме цифр; если получилось 11 цифр с 7/8 в начале — отбросить
-- первую; если итог не ровно 10 цифр (городской без кода, иностранный,
-- обрывок) — не трогаем эту строку вообще, силой не подгоняем.

with digits as (
  select id, regexp_replace(phone, '\D', '', 'g') as raw
  from clients
  where phone is not null
),
cored as (
  select id, case when length(raw) = 11 and left(raw, 1) in ('7', '8') then right(raw, 10) else raw end as core
  from digits
)
update clients c
set phone = '+7(' || substring(cored.core from 1 for 3) || ')' || substring(cored.core from 4 for 3)
  || '-' || substring(cored.core from 7 for 2) || '-' || substring(cored.core from 9 for 2)
from cored
where c.id = cored.id and length(cored.core) = 10;

with digits as (
  select id, regexp_replace(phone, '\D', '', 'g') as raw
  from employees
  where phone is not null
),
cored as (
  select id, case when length(raw) = 11 and left(raw, 1) in ('7', '8') then right(raw, 10) else raw end as core
  from digits
)
update employees e
set phone = '+7(' || substring(cored.core from 1 for 3) || ')' || substring(cored.core from 4 for 3)
  || '-' || substring(cored.core from 7 for 2) || '-' || substring(cored.core from 9 for 2)
from cored
where e.id = cored.id and length(cored.core) = 10;
