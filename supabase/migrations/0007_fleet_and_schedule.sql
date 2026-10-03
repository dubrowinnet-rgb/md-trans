-- Автопарк + рабочий график с доступностью бригады (обсуждение в проекте,
-- 2026-09-23):
--   1. vehicles — техника компании. Заполняет админ или диспетчер
--      (has_order_permission(), как и сами заказы). У водителя — машина по
--      умолчанию (employees.default_vehicle_id), диспетчер может назначить
--      другую конкретному заказу (orders.vehicle_id).
--   2. employee_days_off — выходные дни сотрудника (по умолчанию все дни
--      рабочие, выходной — это явная строка на дату). Обычно проставляет
--      диспетчер/админ; отдельным правом can_manage_own_schedule сотрудник
--      может сам вести свой график (для подрабатывающих грузчиков).
--   3. «Сборный груз»: у водителя может быть несколько заказов одновременно
--      (одна машина, несколько грузов рейсом) — старый триггер это запрещал
--      для всех. Грузчику по-прежнему нельзя быть на двух заказах сразу.
--      Различаем по order_crew.role, а не employees.role: именно эта роль
--      определяет, в качестве кого сотрудник назначен на конкретный заказ
--      (см. следующий пункт).
--   4. Водитель может дополнительно числиться грузчиком на своём же заказе
--      («совмещает функции») — то есть у него два order_crew-строки на один
--      order_id: role='driver' и role='loader'. Старый PK (order_id,
--      employee_id) этого не допускал, меняем на (order_id, employee_id, role).

-- ==========================================================================
-- vehicles
-- ==========================================================================
create table vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plate text not null,
  capacity_kg numeric(10, 2),
  body_dimensions text,
  europallet_count integer,
  top_loading boolean not null default false,
  side_loading boolean not null default false,
  moscow_center_pass boolean not null default false,
  created_at timestamptz not null default now()
);

alter table employees add column default_vehicle_id uuid references vehicles (id) on delete set null;
alter table employees add column can_manage_own_schedule boolean not null default false;
alter table orders add column vehicle_id uuid references vehicles (id) on delete set null;

alter table vehicles enable row level security;
create policy "vehicles select" on vehicles for select to authenticated using (true);
create policy "vehicles insert" on vehicles for insert to authenticated with check (has_order_permission());
create policy "vehicles update" on vehicles for update to authenticated
  using (has_order_permission()) with check (has_order_permission());
create policy "vehicles delete" on vehicles for delete to authenticated using (has_order_permission());

-- ==========================================================================
-- employee_days_off
-- ==========================================================================
create table employee_days_off (
  employee_id uuid not null references employees (id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (employee_id, day)
);

create or replace function can_manage_schedule_for(p_employee_id uuid) returns boolean
language sql stable security invoker as $$
  select has_order_permission() or exists (
    select 1 from employees
    where id = p_employee_id and auth_user_id = auth.uid() and can_manage_own_schedule
  );
$$;

revoke execute on function can_manage_schedule_for(uuid) from public;
grant execute on function can_manage_schedule_for(uuid) to authenticated;

alter table employee_days_off enable row level security;
-- select открыт всем — нужно для карточки заказа (доступность бригады),
-- как и order_crew/orders.
create policy "employee_days_off select" on employee_days_off for select to authenticated using (true);
create policy "employee_days_off insert" on employee_days_off for insert to authenticated
  with check (can_manage_schedule_for(employee_id));
create policy "employee_days_off delete" on employee_days_off for delete to authenticated
  using (can_manage_schedule_for(employee_id));

-- ==========================================================================
-- «Сборный груз»: разрешаем пересечение по времени, только если ОБЕ
-- стороны — водитель на своём заказе. Если хоть одна сторона — грузчик,
-- пересечение по-прежнему запрещено (грузчик физически не может быть на
-- двух заказах одновременно).
-- ==========================================================================
create or replace function check_employee_availability() returns trigger as $$
declare
  conflict_order_id uuid;
begin
  select oc.order_id into conflict_order_id
  from order_crew oc
  join orders o on o.id = oc.order_id
  join orders new_o on new_o.id = new.order_id
  where oc.employee_id = new.employee_id
    and oc.order_id <> new.order_id
    and o.status <> 'cancelled'
    and new_o.status <> 'cancelled'
    and not (oc.role = 'driver' and new.role = 'driver')
    and tstzrange(o.scheduled_start, o.scheduled_end) &&
        tstzrange(new_o.scheduled_start, new_o.scheduled_end)
  limit 1;

  if conflict_order_id is not null then
    raise exception 'Сотрудник % уже занят на заказе % в это время', new.employee_id, conflict_order_id
      using errcode = '23P01';
  end if;

  return new;
end;
$$ language plpgsql;

create or replace function check_orders_schedule_conflicts() returns trigger as $$
declare
  conflict_order_id uuid;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  select o.id into conflict_order_id
  from order_crew oc
  join order_crew new_oc on new_oc.employee_id = oc.employee_id
  join orders o on o.id = oc.order_id
  where new_oc.order_id = new.id
    and oc.order_id <> new.id
    and o.status <> 'cancelled'
    and not (oc.role = 'driver' and new_oc.role = 'driver')
    and tstzrange(o.scheduled_start, o.scheduled_end) &&
        tstzrange(new.scheduled_start, new.scheduled_end)
  limit 1;

  if conflict_order_id is not null then
    raise exception 'Перенос заказа конфликтует по времени с заказом %', conflict_order_id
      using errcode = '23P01';
  end if;

  return new;
end;
$$ language plpgsql;

-- ==========================================================================
-- order_crew: водитель может дополнительно быть грузчиком на своём заказе —
-- нужна вторая строка (тот же order_id и employee_id, другая role).
-- ==========================================================================
alter table order_crew drop constraint order_crew_pkey;
alter table order_crew add primary key (order_id, employee_id, role);

-- ==========================================================================
-- create_order: машина заказа (при вызове из формы подставляется машина
-- водителя по умолчанию, но диспетчер может выбрать другую).
-- ==========================================================================
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
  if not has_order_permission() then
    raise exception 'Недостаточно прав для создания заказа';
  end if;

  if p_client_id is null then
    raise exception 'Заказ без клиента создать нельзя';
  end if;

  insert into orders (client_id, cargo_description, scheduled_start, scheduled_end, actual_price, comment, created_by, vehicle_id)
  values (
    p_client_id, p_cargo_description, p_scheduled_start, p_scheduled_end, p_actual_price, p_comment,
    (select id from employees where auth_user_id = auth.uid()),
    p_vehicle_id
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
