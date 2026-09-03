-- Вертикальный срез MVP: один тенант, без мультитенантности и биллинга.
-- Таблицы соответствуют разделу 6 ТЗ (org_id, Organizations, Vehicles,
-- EmployeeBilling, Reminders, Transactions сознательно не заводим на этом
-- этапе — добавятся отдельной миграцией, когда дойдём до мультитенантности).

create extension if not exists pgcrypto;

-- ==========================================================================
-- employees — водители и грузчики (раздел 2, 6)
-- ==========================================================================
create table employees (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('driver', 'loader')),
  name text not null,
  phone text,
  account_status text not null default 'active'
    check (account_status in ('active', 'pending_payment', 'suspended')),
  paid_until date,
  monthly_price numeric(10, 2),
  -- зарезервировано под будущий GPS-трекинг (раздел 6, 9.4), не используется
  -- ни в одном экране MVP.
  last_location jsonb,
  -- связь с аккаунтом сотрудника для входа в мобильное приложение водителя/
  -- грузчика; nullable — авторизация сотрудника не входит в текущий срез.
  auth_user_id uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index employees_auth_user_id_idx on employees (auth_user_id);

-- ==========================================================================
-- clients — реальные заказчики (раздел 4, п.2)
-- ==========================================================================
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  discount_percent numeric(5, 2) not null default 0
    check (discount_percent >= 0 and discount_percent <= 100),
  notes text,
  created_at timestamptz not null default now()
);

-- ==========================================================================
-- services — каталог услуг (раздел 3)
-- ==========================================================================
create table services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_duration_minutes integer,
  base_price numeric(10, 2),
  category text,
  created_at timestamptz not null default now()
);

-- ==========================================================================
-- orders — заказ (раздел 4, 6). Стоимость в MVP — только actual_price,
-- вписывается диспетчером вручную (раздел 9.3 — формула отложена).
-- ==========================================================================
create table orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients (id),
  -- статус-машина заказа (раздел 4, п.6). Список расширяем по мере
  -- необходимости — это единственное место, которое нужно будет поменять.
  status text not null default 'new'
    check (status in ('new', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  cargo_description text,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  actual_price numeric(10, 2),
  comment text,
  photos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_schedule_valid check (scheduled_end > scheduled_start)
);

create index orders_scheduled_start_idx on orders (scheduled_start);
create index orders_client_id_idx on orders (client_id);

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger orders_set_updated_at
  before update on orders
  for each row
  execute function set_updated_at();

-- ==========================================================================
-- order_stops — точки маршрута (раздел 4, п.1; 9.1)
-- ==========================================================================
create table order_stops (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  type text not null check (type in ('pickup', 'dropoff')),
  address text not null,
  order_index integer not null default 0,
  -- true у основных 2 точек (загрузка/выгрузка) — экран водителя показывает
  -- их крупно, остальные точки сворачиваются под «ещё точки» (раздел 4, п.1).
  is_primary boolean not null default false
);

create index order_stops_order_id_idx on order_stops (order_id);

-- ==========================================================================
-- order_crew — назначение водителя/грузчиков на заказ (раздел 4, п.7, 9.5)
-- ==========================================================================
create table order_crew (
  order_id uuid not null references orders (id) on delete cascade,
  employee_id uuid not null references employees (id),
  role text not null check (role in ('driver', 'loader')),
  -- подтверждение получения заказа сотрудником (раздел 9.5)
  status text not null default 'notified'
    check (status in ('notified', 'read', 'confirmed')),
  notified_at timestamptz,
  read_at timestamptz,
  primary key (order_id, employee_id)
);

create index order_crew_employee_id_idx on order_crew (employee_id);

-- Проверка занятости сотрудника по времени (раздел 4, п.8) — источник
-- истины на уровне БД: любая попытка назначить сотрудника на два заказа с
-- пересекающимися scheduled_start/scheduled_end блокируется, независимо от
-- того, откуда пришёл запрос (моб. приложение, веб-кабинет, будущий API).
-- Экран создания заказа дополнительно делает такую же проверку заранее —
-- чтобы диспетчер не выбрал занятого сотрудника и не наткнулся на эту
-- ошибку после отправки формы.
create function check_employee_availability() returns trigger as $$
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

create trigger order_crew_check_availability
  before insert or update of employee_id on order_crew
  for each row
  execute function check_employee_availability();

-- Пересчитать занятость экипажа при переносе времени самого заказа
-- (те же условия, что и в триггере выше, но со стороны orders).
create function check_orders_schedule_conflicts() returns trigger as $$
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

create trigger orders_check_schedule_conflicts
  before update of scheduled_start, scheduled_end on orders
  for each row
  execute function check_orders_schedule_conflicts();

-- ==========================================================================
-- order_services — состав услуг заказа (раздел 6)
-- ==========================================================================
create table order_services (
  order_id uuid not null references orders (id) on delete cascade,
  service_id uuid not null references services (id),
  qty integer not null default 1 check (qty > 0),
  primary key (order_id, service_id)
);

-- ==========================================================================
-- RLS — на этом срезе один тенант, разграничение только «авторизован /
-- нет» (анонимный anon-key доступа к данным не имеет). Разбивка по
-- организациям добавится отдельной миграцией на этапе мультитенантности.
-- ==========================================================================
alter table employees enable row level security;
alter table clients enable row level security;
alter table services enable row level security;
alter table orders enable row level security;
alter table order_stops enable row level security;
alter table order_crew enable row level security;
alter table order_services enable row level security;

create policy "authenticated full access" on employees
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on clients
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on services
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on orders
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on order_stops
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on order_crew
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on order_services
  for all to authenticated using (true) with check (true);
