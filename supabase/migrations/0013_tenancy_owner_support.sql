-- Мультитенантность (обсуждение в проекте, 2026-09-25): «подключённый
-- администратор» становится настоящей компанией (тенантом) со своим
-- изолированным набором сотрудников/клиентов/заказов/техники/настроек.
-- Максим получает отдельную роль 'owner' — управляет компаниями и
-- подписками, но НЕ видит операционные данные (заказы/клиентов) внутри
-- них, только техподдержку.
--
-- Ключевая ловушка при переносе RLS с «true» на «своя компания»: политики
-- ссылаются на get_my_company_id()/is_service_owner(), а те сами читают
-- employees — то есть снова упираются в политику "employees select". Без
-- SECURITY DEFINER на этих двух функциях получится бесконечная рекурсия
-- (постоянно проверяем сами себя). SECURITY DEFINER здесь безопасен: обе
-- функции читают только auth.uid() — свою же строку, а не чужие данные.
-- Остальные существующие помощники (is_admin(), has_order_permission() и
-- т.д.) менять не нужно: они вызывают employees select РОВНО один раз,
-- а та уже разрешается без дальнейшей рекурсии через definer-функции.

-- ==========================================================================
-- companies — компания-тенант («клиент сервиса» в терминах Максима).
-- ==========================================================================
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subscription_status text not null default 'pending_payment'
    check (subscription_status in ('active', 'pending_payment', 'suspended')),
  subscription_plan text,
  subscription_price numeric(10, 2),
  subscription_expires_at date,
  created_at timestamptz not null default now()
);

-- Существующие данные Максима становятся первой компанией — фиксированный
-- id, чтобы ссылаться на него ниже по файлу без переменных/CTE. Ничего в
-- работе приложения для него не меняется.
insert into companies (id, name, subscription_status)
values ('00000000-0000-0000-0000-000000000001', 'Основная компания', 'active');

-- ==========================================================================
-- employees.role — новое значение 'owner'. У владельца нет company_id
-- (не привязан ни к одной компании), у всех остальных ролей company_id
-- обязателен — это разные ветки одного constraint'а, а не просто nullable.
-- ==========================================================================
alter table employees drop constraint employees_role_check;
alter table employees add constraint employees_role_check
  check (role in ('owner', 'admin', 'dispatcher', 'driver', 'loader'));

alter table employees add column company_id uuid references companies (id);
update employees set company_id = '00000000-0000-0000-0000-000000000001' where company_id is null;
alter table employees add constraint employees_company_id_by_role check (
  (role = 'owner' and company_id is null) or (role <> 'owner' and company_id is not null)
);
create index employees_company_id_idx on employees (company_id);

-- ==========================================================================
-- Функции-помощники для RLS — определены здесь (employees.company_id уже
-- существует выше, а ниже они нужны и в DEFAULT колонок, и в политиках).
-- security definer + фиксированный search_path обязательны — иначе их
-- собственный select из employees упрётся в политику "employees select",
-- которая сама вызывает эти же функции (бесконечная рекурсия / stack
-- depth exceeded). Остальные существующие помощники (is_admin(),
-- has_order_permission() и т.д.) менять не нужно: они вызывают employees
-- select ровно один раз, а та уже резолвится без дальнейшей рекурсии
-- через эти definer-функции.
-- ==========================================================================
create or replace function get_my_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from employees where auth_user_id = auth.uid();
$$;

create or replace function is_service_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from employees where auth_user_id = auth.uid() and role = 'owner'
  );
$$;

revoke execute on function get_my_company_id() from public;
revoke execute on function is_service_owner() from public;
grant execute on function get_my_company_id() to authenticated;
grant execute on function is_service_owner() to authenticated;

-- ==========================================================================
-- Остальные таблицы «первого уровня» — company_id обязателен всегда
-- (клиенты/заказы/услуги/техника/шаблоны/правила не бывают без компании).
-- DEFAULT get_my_company_id() — существующий код приложения вставляет эти
-- строки без company_id в теле запроса (например useCreateReminderRule);
-- без DEFAULT такая вставка упёрлась бы в NOT NULL. RLS-проверка (with
-- check company_id = get_my_company_id()) при этом остаётся в силе и на
-- значение из DEFAULT — подделать компанию через явно переданное поле
-- всё равно нельзя.
-- ==========================================================================
alter table clients add column company_id uuid references companies (id);
update clients set company_id = '00000000-0000-0000-0000-000000000001' where company_id is null;
alter table clients alter column company_id set not null;
alter table clients alter column company_id set default get_my_company_id();
create index clients_company_id_idx on clients (company_id);

alter table orders add column company_id uuid references companies (id);
update orders set company_id = '00000000-0000-0000-0000-000000000001' where company_id is null;
alter table orders alter column company_id set not null;
alter table orders alter column company_id set default get_my_company_id();
create index orders_company_id_idx on orders (company_id);

alter table services add column company_id uuid references companies (id);
update services set company_id = '00000000-0000-0000-0000-000000000001' where company_id is null;
alter table services alter column company_id set not null;
alter table services alter column company_id set default get_my_company_id();
create index services_company_id_idx on services (company_id);

alter table vehicles add column company_id uuid references companies (id);
update vehicles set company_id = '00000000-0000-0000-0000-000000000001' where company_id is null;
alter table vehicles alter column company_id set not null;
alter table vehicles alter column company_id set default get_my_company_id();
create index vehicles_company_id_idx on vehicles (company_id);

-- sms_templates: ключ шаблона ('new_order' и т.д.) был глобальным
-- первичным ключом — теперь у каждой компании свой набор из тех же
-- ключей, первичный ключ расширяется до (company_id, key).
alter table sms_templates add column company_id uuid references companies (id);
update sms_templates set company_id = '00000000-0000-0000-0000-000000000001' where company_id is null;
alter table sms_templates alter column company_id set not null;
alter table sms_templates alter column company_id set default get_my_company_id();
alter table sms_templates drop constraint sms_templates_pkey;
alter table sms_templates add primary key (company_id, key);

alter table reminder_rules add column company_id uuid references companies (id);
update reminder_rules set company_id = '00000000-0000-0000-0000-000000000001' where company_id is null;
alter table reminder_rules alter column company_id set not null;
alter table reminder_rules alter column company_id set default get_my_company_id();
create index reminder_rules_company_id_idx on reminder_rules (company_id);

-- order_stops/order_crew/order_services/employee_schedule_days/
-- order_reminder_log намеренно НЕ получают свой company_id — это дочерние
-- таблицы (у каждой уже есть order_id или employee_id), компания
-- проверяется в RLS через родителя. Меньше колонок, которые могут разойтись.

-- ==========================================================================
-- employees — RLS: видно свою компанию (плюс владельцу — все, для
-- подсчёта сотрудников по компаниям). Заводить/менять/удалять чужого
-- сотрудника может только админ СВОЕЙ компании. Менять свою собственную
-- строку может любой (как раньше), но не роль/компанию себе — это ниже,
-- отдельным триггером.
-- ==========================================================================
drop policy "employees select" on employees;
create policy "employees select" on employees for select to authenticated
  using (is_service_owner() or company_id = get_my_company_id());

drop policy "employees insert by admin" on employees;
create policy "employees insert by admin" on employees for insert to authenticated
  with check (is_admin() and company_id = get_my_company_id());

drop policy "employees update" on employees;
create policy "employees update" on employees for update to authenticated
  using ((is_admin() and company_id = get_my_company_id()) or auth_user_id = auth.uid())
  with check ((is_admin() and company_id = get_my_company_id()) or auth_user_id = auth.uid());

drop policy "employees delete by admin" on employees;
create policy "employees delete by admin" on employees for delete to authenticated
  using (is_admin() and company_id = get_my_company_id());

-- Не-администратор не может сам себе сменить роль или компанию через
-- прямой PATCH к таблице (раньше этого не требовалось — без company_id
-- смена роли была вредной, но не «побегом» из тенанта; теперь это ровно
-- то, чем мог бы воспользоваться недобросовестный сотрудник). Админ
-- по-прежнему может — RLS выше уже ограничивает его СВОЕЙ компанией.
create or replace function restrict_employee_self_role_change() returns trigger as $$
begin
  if not is_admin() and (new.role is distinct from old.role or new.company_id is distinct from old.company_id) then
    raise exception 'Недостаточно прав для изменения роли или компании' using errcode = '42501';
  end if;
  return new;
end;
$$ language plpgsql security invoker;

create trigger employees_restrict_self_role_change
  before update on employees
  for each row
  execute function restrict_employee_self_role_change();

-- ==========================================================================
-- clients — до сих пор была общая «authenticated full access» (0001), то
-- есть читать/писать мог любой вошедший. Оставляем ту же ширину прав,
-- добавляем только границу компании.
-- ==========================================================================
drop policy "authenticated full access" on clients;
create policy "clients select" on clients for select to authenticated using (company_id = get_my_company_id());
create policy "clients insert" on clients for insert to authenticated with check (company_id = get_my_company_id());
create policy "clients update" on clients for update to authenticated
  using (company_id = get_my_company_id()) with check (company_id = get_my_company_id());
create policy "clients delete" on clients for delete to authenticated using (company_id = get_my_company_id());

-- ==========================================================================
-- services
-- ==========================================================================
drop policy "services select" on services;
drop policy "services write by admin" on services;
create policy "services select" on services for select to authenticated using (company_id = get_my_company_id());
create policy "services write by admin" on services for all to authenticated
  using (is_admin() and company_id = get_my_company_id())
  with check (is_admin() and company_id = get_my_company_id());

-- ==========================================================================
-- vehicles
-- ==========================================================================
drop policy "vehicles select" on vehicles;
drop policy "vehicles insert" on vehicles;
drop policy "vehicles update" on vehicles;
drop policy "vehicles delete" on vehicles;
create policy "vehicles select" on vehicles for select to authenticated using (company_id = get_my_company_id());
create policy "vehicles insert" on vehicles for insert to authenticated
  with check (has_order_permission() and company_id = get_my_company_id());
create policy "vehicles update" on vehicles for update to authenticated
  using (has_order_permission() and company_id = get_my_company_id())
  with check (has_order_permission() and company_id = get_my_company_id());
create policy "vehicles delete" on vehicles for delete to authenticated
  using (has_order_permission() and company_id = get_my_company_id());

-- ==========================================================================
-- sms_templates / reminder_rules
-- ==========================================================================
drop policy "sms_templates select" on sms_templates;
drop policy "sms_templates update by admin" on sms_templates;
create policy "sms_templates select" on sms_templates for select to authenticated
  using (company_id = get_my_company_id());
create policy "sms_templates update by admin" on sms_templates for update to authenticated
  using (is_admin() and company_id = get_my_company_id())
  with check (is_admin() and company_id = get_my_company_id());

drop policy "reminder_rules select" on reminder_rules;
drop policy "reminder_rules write by admin" on reminder_rules;
create policy "reminder_rules select" on reminder_rules for select to authenticated
  using (company_id = get_my_company_id());
create policy "reminder_rules write by admin" on reminder_rules for all to authenticated
  using (is_admin() and company_id = get_my_company_id())
  with check (is_admin() and company_id = get_my_company_id());

-- Новая компания сразу получает тот же стартовый набор шаблонов/правил,
-- что заводила миграция 0011 для единственной тогда компании — иначе
-- «Настройки» новой компании открываются пустыми, а смс клиенту молча не
-- уходит (шаблон new_order просто не найдётся). Название компании в
-- текст шаблона не подставляем — это не заготовка под конкретный бизнес,
-- как было у Максима, а нейтральный текст, который админ компании допишет
-- сам.
create or replace function seed_company_defaults() returns trigger as $$
begin
  insert into sms_templates (company_id, key, label, body) values
    (new.id, 'new_order', 'Новый заказ (клиенту)',
     '[Name], подтверждаю Ваш заказ [Day], [Date] в [Time] в оговоренном месте.'),
    (new.id, 'reminder', 'Напоминание клиенту о заказе',
     'Напоминаю. У вас заказ [Day], [Date] на [Time]'),
    (new.id, 'completed', 'Заказ выполнен',
     '[Name], Ваш заказ выполнен! Стоимость всех работ составила [Cost]. Спасибо, что выбрали нас!'),
    (new.id, 'cancelled', 'Заказ отменён',
     'Ваш заказ на [Day], [Date] на [Time] отменён. Извините.');
  insert into reminder_rules (company_id, target, offset_minutes) values (new.id, 'crew_push', 30);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger companies_seed_defaults
  after insert on companies
  for each row
  execute function seed_company_defaults();

-- ==========================================================================
-- orders — политики те же, что и раньше (has_order_permission()/is_driver()
-- из миграций 0005/0006), просто с добавленной границей компании.
-- ==========================================================================
drop policy "orders select" on orders;
drop policy "orders insert" on orders;
drop policy "orders update" on orders;
drop policy "orders delete" on orders;
create policy "orders select" on orders for select to authenticated using (company_id = get_my_company_id());
create policy "orders insert" on orders for insert to authenticated
  with check (has_order_permission() and company_id = get_my_company_id());
create policy "orders update" on orders for update to authenticated
  using ((has_order_permission() or is_driver()) and company_id = get_my_company_id())
  with check ((has_order_permission() or is_driver()) and company_id = get_my_company_id());
create policy "orders delete" on orders for delete to authenticated
  using (has_order_permission() and company_id = get_my_company_id());

-- order_stops / order_services — дочерние, своего company_id нет,
-- граница компании проверяется через orders.
drop policy "order_stops select" on order_stops;
drop policy "order_stops insert" on order_stops;
drop policy "order_stops update" on order_stops;
drop policy "order_stops delete" on order_stops;
create policy "order_stops select" on order_stops for select to authenticated
  using (exists (select 1 from orders o where o.id = order_stops.order_id and o.company_id = get_my_company_id()));
create policy "order_stops insert" on order_stops for insert to authenticated
  with check (has_order_permission()
    and exists (select 1 from orders o where o.id = order_stops.order_id and o.company_id = get_my_company_id()));
create policy "order_stops update" on order_stops for update to authenticated
  using (has_order_permission()
    and exists (select 1 from orders o where o.id = order_stops.order_id and o.company_id = get_my_company_id()))
  with check (has_order_permission()
    and exists (select 1 from orders o where o.id = order_stops.order_id and o.company_id = get_my_company_id()));
create policy "order_stops delete" on order_stops for delete to authenticated
  using (has_order_permission()
    and exists (select 1 from orders o where o.id = order_stops.order_id and o.company_id = get_my_company_id()));

drop policy "order_services select" on order_services;
drop policy "order_services insert" on order_services;
drop policy "order_services update" on order_services;
drop policy "order_services delete" on order_services;
create policy "order_services select" on order_services for select to authenticated
  using (exists (select 1 from orders o where o.id = order_services.order_id and o.company_id = get_my_company_id()));
create policy "order_services insert" on order_services for insert to authenticated
  with check (has_order_permission()
    and exists (select 1 from orders o where o.id = order_services.order_id and o.company_id = get_my_company_id()));
create policy "order_services update" on order_services for update to authenticated
  using (has_order_permission()
    and exists (select 1 from orders o where o.id = order_services.order_id and o.company_id = get_my_company_id()))
  with check (has_order_permission()
    and exists (select 1 from orders o where o.id = order_services.order_id and o.company_id = get_my_company_id()));
create policy "order_services delete" on order_services for delete to authenticated
  using (has_order_permission()
    and exists (select 1 from orders o where o.id = order_services.order_id and o.company_id = get_my_company_id()));

-- order_crew — то же самое, плюс сохраняем существующую ветку «сотрудник
-- всегда может обновить свою же строку» (отметка «принял», миграция 0005).
drop policy "order_crew select" on order_crew;
drop policy "order_crew insert" on order_crew;
drop policy "order_crew update" on order_crew;
drop policy "order_crew delete" on order_crew;
create policy "order_crew select" on order_crew for select to authenticated
  using (exists (select 1 from orders o where o.id = order_crew.order_id and o.company_id = get_my_company_id()));
create policy "order_crew insert" on order_crew for insert to authenticated
  with check (has_order_permission()
    and exists (select 1 from orders o where o.id = order_crew.order_id and o.company_id = get_my_company_id()));
create policy "order_crew update" on order_crew for update to authenticated
  using ((has_order_permission() or employee_id in (select id from employees where auth_user_id = auth.uid()))
    and exists (select 1 from orders o where o.id = order_crew.order_id and o.company_id = get_my_company_id()))
  with check ((has_order_permission() or employee_id in (select id from employees where auth_user_id = auth.uid()))
    and exists (select 1 from orders o where o.id = order_crew.order_id and o.company_id = get_my_company_id()));
create policy "order_crew delete" on order_crew for delete to authenticated
  using (has_order_permission()
    and exists (select 1 from orders o where o.id = order_crew.order_id and o.company_id = get_my_company_id()));

-- employee_schedule_days — дочерняя от employees.
drop policy "employee_schedule_days select" on employee_schedule_days;
drop policy "employee_schedule_days insert" on employee_schedule_days;
drop policy "employee_schedule_days update" on employee_schedule_days;
drop policy "employee_schedule_days delete" on employee_schedule_days;
create policy "employee_schedule_days select" on employee_schedule_days for select to authenticated
  using (exists (
    select 1 from employees e where e.id = employee_schedule_days.employee_id and e.company_id = get_my_company_id()
  ));
create policy "employee_schedule_days insert" on employee_schedule_days for insert to authenticated
  with check (can_manage_schedule_for(employee_id) and exists (
    select 1 from employees e where e.id = employee_schedule_days.employee_id and e.company_id = get_my_company_id()
  ));
create policy "employee_schedule_days update" on employee_schedule_days for update to authenticated
  using (can_manage_schedule_for(employee_id) and exists (
    select 1 from employees e where e.id = employee_schedule_days.employee_id and e.company_id = get_my_company_id()
  ))
  with check (can_manage_schedule_for(employee_id) and exists (
    select 1 from employees e where e.id = employee_schedule_days.employee_id and e.company_id = get_my_company_id()
  ));
create policy "employee_schedule_days delete" on employee_schedule_days for delete to authenticated
  using (can_manage_schedule_for(employee_id) and exists (
    select 1 from employees e where e.id = employee_schedule_days.employee_id and e.company_id = get_my_company_id()
  ));

-- create_order — та же сигнатура и логика, теперь дополнительно
-- проставляет company_id заказа (компания того, кто его создаёт).
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

-- ==========================================================================
-- companies — читает и пишет только владелец сервиса. Обычная
-- администраторская роль свою компанию через эту таблицу не видит (это не
-- запрашивалось — «Оплата профиля» и так уже показывает сотруднику его
-- собственный employees.paid_until, отдельная от подписки компании вещь).
-- ==========================================================================
alter table companies enable row level security;
create policy "companies select by owner" on companies for select to authenticated using (is_service_owner());
create policy "companies insert by owner" on companies for insert to authenticated with check (is_service_owner());
create policy "companies update by owner" on companies for update to authenticated
  using (is_service_owner()) with check (is_service_owner());

-- ==========================================================================
-- support_tickets / support_ticket_messages — обращения администратора
-- компании к владельцу сервиса. Кнопка есть только у администратора
-- (раздел «Настройки» в приложении), поэтому и заводить обращения может
-- только он; отвечать в переписке — тоже он (в своей компании) или
-- владелец (в любой).
-- ==========================================================================
create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id),
  created_by uuid not null references employees (id),
  subject text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_tickets_company_id_idx on support_tickets (company_id);

alter table support_tickets enable row level security;
create trigger support_tickets_set_updated_at
  before update on support_tickets
  for each row
  execute function set_updated_at();

create policy "support_tickets select" on support_tickets for select to authenticated
  using (is_service_owner() or company_id = get_my_company_id());
create policy "support_tickets insert" on support_tickets for insert to authenticated
  with check (
    is_admin() and company_id = get_my_company_id()
    and created_by = (select id from employees where auth_user_id = auth.uid())
  );
create policy "support_tickets update" on support_tickets for update to authenticated
  using (is_service_owner() or (is_admin() and company_id = get_my_company_id()))
  with check (is_service_owner() or (is_admin() and company_id = get_my_company_id()));

create table support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets (id) on delete cascade,
  sender_id uuid not null references employees (id),
  body text not null,
  created_at timestamptz not null default now()
);

create index support_ticket_messages_ticket_id_idx on support_ticket_messages (ticket_id);

alter table support_ticket_messages enable row level security;

create policy "support_ticket_messages select" on support_ticket_messages for select to authenticated
  using (exists (
    select 1 from support_tickets t
    where t.id = support_ticket_messages.ticket_id
      and (is_service_owner() or t.company_id = get_my_company_id())
  ));
create policy "support_ticket_messages insert" on support_ticket_messages for insert to authenticated
  with check (
    sender_id = (select id from employees where auth_user_id = auth.uid())
    and exists (
      select 1 from support_tickets t
      where t.id = support_ticket_messages.ticket_id
        and (is_service_owner() or (is_admin() and t.company_id = get_my_company_id()))
    )
  );

-- Пуш владельцу о новом обращении — сразу при создании тикета, с любой
-- стороны (мобильное приложение или веб-кабинет), поэтому это триггер в
-- базе, а не код в конкретном клиенте. pg_net уже включён миграцией 0011.
create extension if not exists pg_net;

create or replace function notify_owner_new_ticket() returns trigger as $$
begin
  perform net.http_post(
    url := 'https://mjrbqnsvwohmwvapiikr.supabase.co/functions/v1/notify-owner-new-ticket',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('ticket_id', new.id)
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger support_tickets_notify_owner
  after insert on support_tickets
  for each row
  execute function notify_owner_new_ticket();
