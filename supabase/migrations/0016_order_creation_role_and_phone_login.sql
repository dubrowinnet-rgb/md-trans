-- Доработки 3 (2026-09-26), пп. 2, 4 и 5.
--
-- П.5 — «Создавать заказы может только диспетчер/админ»: раньше это же
-- разрешал и can_manage_orders (см. has_order_permission(), 0005) — водителю
-- или грузчику, которому админ включил эту галочку, значит, можно было и
-- создать новый заказ, хотя по факту ей давали доступ только чтобы
-- поправить/удалить существующий. Теперь создание — отдельное право, не
-- зависящее от can_manage_orders: только admin/dispatcher, без исключений.
-- Полное редактирование/удаление уже существующего заказа для
-- can_manage_orders у водителя/грузчика не меняется — только создание.
--
-- Заодно узкое право водителя «время и сумма своего заказа» (раньше —
-- жёстко для любого водителя без can_manage_orders, см.
-- enforce_driver_order_update() в 0006) становится обычной галочкой на
-- сотруднике, как остальные — админ включает её сам, кому нужно.
-- Существующим водителям включаем сразу (у них это и так уже работало,
-- поведение не меняется без явного действия администратора).
alter table employees add column if not exists can_edit_order_schedule_and_price boolean not null default false;
update employees set can_edit_order_schedule_and_price = true where role = 'driver';

create or replace function can_create_orders() returns boolean
language sql stable security invoker as $$
  select exists (
    select 1 from employees where auth_user_id = auth.uid() and role in ('admin', 'dispatcher')
  );
$$;

revoke execute on function can_create_orders() from public;
grant execute on function can_create_orders() to authenticated;

-- Migration 0013 добавила к этой политике границу компании
-- (company_id = get_my_company_id()) — сохраняем её, меняем только само
-- условие прав (has_order_permission() → can_create_orders()).
drop policy if exists "orders insert" on orders;
create policy "orders insert" on orders for insert to authenticated
  with check (can_create_orders() and company_id = get_my_company_id());

-- Точная копия сигнатуры из 0013 (добавила p_vehicle_id и company_id) —
-- create or replace без совпадения сигнатуры создаёт ВТОРУЮ, отдельную
-- функцию вместо замены существующей (проверено локально: именно так и
-- произошло при первой версии этого файла — вызов create_order стал
-- неоднозначным, «is not unique»). Меняем только саму проверку прав.
create or replace function create_order(
  p_client_id uuid,
  p_cargo_description text,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_actual_price numeric,
  p_comment text,
  p_stops jsonb,
  p_crew jsonb,
  p_services jsonb default '[]'::jsonb,
  p_vehicle_id uuid default null
) returns uuid
language plpgsql
security invoker
as $$
declare
  new_order_id uuid;
begin
  if not can_create_orders() then
    raise exception 'Создавать заказы может только администратор или диспетчер';
  end if;

  if p_client_id is null then
    raise exception 'Заказ без клиента создать нельзя';
  end if;

  insert into orders (
    client_id, cargo_description, scheduled_start, scheduled_end, actual_price, comment, created_by, vehicle_id,
    company_id
  )
  values (
    p_client_id, p_cargo_description, p_scheduled_start, p_scheduled_end, p_actual_price, p_comment,
    (select id from employees where auth_user_id = auth.uid()),
    p_vehicle_id,
    get_my_company_id()
  )
  returning id into new_order_id;

  insert into order_stops (order_id, type, address, order_index, is_primary)
  select
    new_order_id,
    (s->>'type')::text,
    s->>'address',
    coalesce((s->>'order_index')::int, 0),
    coalesce((s->>'is_primary')::boolean, false)
  from jsonb_array_elements(p_stops) s;

  insert into order_crew (order_id, employee_id, role, status, notified_at)
  select
    new_order_id,
    (c->>'employee_id')::uuid,
    (c->>'role')::text,
    'notified',
    now()
  from jsonb_array_elements(p_crew) c;

  insert into order_services (order_id, service_id, qty)
  select
    new_order_id,
    (x->>'service_id')::uuid,
    coalesce((x->>'qty')::int, 1)
  from jsonb_array_elements(p_services) x;

  return new_order_id;
end;
$$;

-- Узкое право водителя теперь проверяется по галочке, а не автоматически
-- для всей роли — auth.uid() is null (вызов не от приложения — SQL-редактор,
-- миграция, сервисная роль) по-прежнему пропускается без проверки, см. 0006.
create or replace function enforce_driver_order_update()
returns trigger
language plpgsql
security invoker
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if has_order_permission() then
    return new;
  end if;

  if not is_driver() or not exists (
    select 1 from employees
    where auth_user_id = auth.uid() and can_edit_order_schedule_and_price
  ) then
    raise exception 'Недостаточно прав для изменения заказа';
  end if;

  if not exists (
    select 1 from order_crew oc
    join employees e on e.id = oc.employee_id
    where oc.order_id = new.id and e.auth_user_id = auth.uid()
  ) then
    raise exception 'Вы не назначены на этот заказ';
  end if;

  if new.id is distinct from old.id
     or new.client_id is distinct from old.client_id
     or new.status is distinct from old.status
     or new.cargo_description is distinct from old.cargo_description
     or new.comment is distinct from old.comment
     or new.photos is distinct from old.photos
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Водителю доступны только время и сумма заказа';
  end if;

  return new;
end;
$$;

-- П.4 — «Логин сотрудникам не нужен, вход по номеру телефона и паролю».
-- Supabase Auth умеет входить по phone+password напрямую (как и по
-- email+password) — отдельного поля «логин» для этого не нужно, телефон
-- уже был у каждого сотрудника (employees.phone). Внутренний email
-- (login@mdtrans.internal) на auth.users не убираем — Supabase Admin API
-- заводит пользователя с email всегда (это просто техническая деталь входа,
-- сотрудник его не видит и не вводит), но приложение с этого момента входит
-- только по телефону. Уже существующим аккаунтам (заведённым по логину) сам
-- телефон на auth.users добавляет create-account/update-account при
-- следующем сохранении профиля — см. supabase/functions/update-account и
-- mobile/src/providers/SessionProvider.tsx (тихая синхронизация при входе).
--
-- Нужно один раз включить в Supabase: Authentication → Providers → Phone →
-- Enable Phone Provider. SMS-провайдер (Twilio и т.п.) настраивать не
-- нужно — коды подтверждения по SMS этому приложению не нужны, телефон
-- сразу подтверждается сервером (phone_confirm: true), как и email раньше.

-- П.2 — «Частые/запомненные адреса»: без новой таблицы, просто считаем,
-- какие адреса уже встречались в заказах СВОЕЙ компании — этого достаточно
-- для подсказки «часто используемые» под полем адреса в форме заказа.
-- security invoker — RLS на orders/order_stops (миграция 0013) и так не
-- даст увидеть чужую компанию, company_id = get_my_company_id() здесь же —
-- просто чтобы не тянуть лишние строки из order_stops до фильтрации.
create or replace function recent_addresses(p_limit int default 8) returns table(address text, uses bigint)
language sql stable security invoker as $$
  select os.address, count(*) as uses
  from order_stops os
  join orders o on o.id = os.order_id
  where o.company_id = get_my_company_id()
  group by os.address
  order by count(*) desc, max(o.created_at) desc
  limit p_limit;
$$;

revoke execute on function recent_addresses(int) from public;
grant execute on function recent_addresses(int) to authenticated;
