-- Скорость под нагрузкой (Максим, 2026-09-28: «чтобы приложение
-- бесперебойно и быстро работало под нагрузкой 1000 администраторов и 3000
-- сотрудников»). Права и правила не меняются — только то, как база их
-- проверяет и считает. Проверено на тестовой базе такого размера:
-- 1000 компаний, 3925 сотрудников, 1,4 млн заказов за год.
--
-- Что было узким местом:
-- • Проверки прав (is_admin(), has_order_permission() и остальные) читали
--   таблицу employees «от имени» пользователя, то есть через её же политику
--   доступа. База не могла взять индекс по auth_user_id и перебирала всех
--   сотрудников всех компаний, вызывая для каждого ещё две функции. Одна
--   проверка — 60–120 мс, а в политиках она шла на каждую строку: лента
--   отчётов водителя открывалась 8 секунд и дольше.
-- • В политиках функции вызывались на каждую строку. Теперь каждая обёрнута
--   в (select …) — база считает её один раз на запрос.
-- • Не было индексов «компания + время заказа» и индексов на внешних
--   ключах (удаление заказа, машины, услуги перебирало целые таблицы).
-- • Статистику, сводку по клиентам и счётчик отчётов на проверке
--   приложение и кабинет собирали, скачивая все строки. API отдаёт не больше
--   1000 строк за запрос, поэтому у компании с большой историей цифры
--   молча обрезались. Теперь это считают функции в базе.
-- • Напоминания бригаде (send-crew-reminders) брали правила ВСЕХ компаний
--   и заказы ВСЕХ компаний: при N компаниях сотрудник получал N одинаковых
--   напоминаний. Теперь правило компании действует только на её заказы, а
--   отбор и отметка «уже напомнили» — одним запросом (claim_crew_reminders).
-- • Журнал напоминаний (order_reminder_log) рос без конца. Теперь записи
--   по заказам, начавшимся больше суток назад, удаляются при каждом запуске.
-- • Напоминание водителям об отчёте (remind-driver-report) уходило в Expo
--   одним запросом, а Expo принимает не больше 100 пушей за раз — при
--   большом числе водителей не доходило ни одно. Кому напомнить, теперь
--   считает база (driver_report_reminder_tokens), пуши уходят пачками.
--
-- Файл можно выполнить повторно.

-- ==========================================================================
-- 1. Кто я: быстрые проверки прав
-- ==========================================================================
-- Все проверки читают только СВОЮ строку сотрудника (auth_user_id =
-- auth.uid()) и возвращают да/нет или свой id, поэтому их можно выполнять
-- от имени владельца таблицы (security definer), мимо политики employees —
-- так же, как уже сделаны get_my_company_id() и is_service_owner().

create or replace function get_my_employee_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from employees where auth_user_id = auth.uid();
$$;
revoke execute on function get_my_employee_id() from public, anon;
grant execute on function get_my_employee_id() to authenticated, service_role;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from employees where auth_user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function is_driver() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from employees where auth_user_id = auth.uid() and role = 'driver'
  );
$$;

create or replace function has_order_permission() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from employees
    where auth_user_id = auth.uid()
      and (role = 'admin' or can_manage_orders)
  );
$$;

create or replace function can_create_orders() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from employees where auth_user_id = auth.uid() and role in ('admin', 'dispatcher')
  );
$$;

create or replace function can_review_driver_reports() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from employees where auth_user_id = auth.uid() and role in ('admin', 'dispatcher')
  );
$$;

-- То же, что раньше «has_order_permission() или это я сам с правом вести
-- свой график», одним чтением своей строки.
create or replace function can_manage_schedule_for(p_employee_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from employees
    where auth_user_id = auth.uid()
      and (role = 'admin' or can_manage_orders or (id = p_employee_id and can_manage_own_schedule))
  );
$$;

-- ==========================================================================
-- 2. Политики доступа: те же условия, функции считаются раз на запрос
-- ==========================================================================

-- clients
drop policy if exists "clients select" on clients;
create policy "clients select" on clients for select to authenticated
  using (company_id = (select get_my_company_id()));
drop policy if exists "clients insert" on clients;
create policy "clients insert" on clients for insert to authenticated
  with check (company_id = (select get_my_company_id()));
drop policy if exists "clients update" on clients;
create policy "clients update" on clients for update to authenticated
  using (company_id = (select get_my_company_id()))
  with check (company_id = (select get_my_company_id()));
drop policy if exists "clients delete" on clients;
create policy "clients delete" on clients for delete to authenticated
  using (company_id = (select get_my_company_id()));

-- companies
drop policy if exists "companies select by owner" on companies;
create policy "companies select by owner" on companies for select to authenticated
  using ((select is_service_owner()));
drop policy if exists "companies insert by owner" on companies;
create policy "companies insert by owner" on companies for insert to authenticated
  with check ((select is_service_owner()));
drop policy if exists "companies update by owner" on companies;
create policy "companies update by owner" on companies for update to authenticated
  using ((select is_service_owner()))
  with check ((select is_service_owner()));

-- employees
drop policy if exists "employees select" on employees;
create policy "employees select" on employees for select to authenticated
  using ((select is_service_owner()) or company_id = (select get_my_company_id()));
drop policy if exists "employees insert by admin" on employees;
create policy "employees insert by admin" on employees for insert to authenticated
  with check ((select is_admin()) and company_id = (select get_my_company_id()));
drop policy if exists "employees update" on employees;
create policy "employees update" on employees for update to authenticated
  using (((select is_admin()) and company_id = (select get_my_company_id())) or auth_user_id = (select auth.uid()))
  with check (((select is_admin()) and company_id = (select get_my_company_id())) or auth_user_id = (select auth.uid()));
drop policy if exists "employees delete by admin" on employees;
create policy "employees delete by admin" on employees for delete to authenticated
  using ((select is_admin()) and company_id = (select get_my_company_id()));

-- orders
drop policy if exists "orders select" on orders;
create policy "orders select" on orders for select to authenticated
  using (company_id = (select get_my_company_id()));
drop policy if exists "orders insert" on orders;
create policy "orders insert" on orders for insert to authenticated
  with check ((select can_create_orders()) and company_id = (select get_my_company_id()));
drop policy if exists "orders update" on orders;
create policy "orders update" on orders for update to authenticated
  using (((select has_order_permission()) or (select is_driver())) and company_id = (select get_my_company_id()))
  with check (((select has_order_permission()) or (select is_driver())) and company_id = (select get_my_company_id()));
drop policy if exists "orders delete" on orders;
create policy "orders delete" on orders for delete to authenticated
  using ((select has_order_permission()) and company_id = (select get_my_company_id()));

-- order_stops, order_services: строка видна и меняется вместе со своим
-- заказом своей компании
drop policy if exists "order_stops select" on order_stops;
create policy "order_stops select" on order_stops for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and o.company_id = (select get_my_company_id())));
drop policy if exists "order_stops insert" on order_stops;
create policy "order_stops insert" on order_stops for insert to authenticated
  with check ((select has_order_permission())
    and exists (select 1 from orders o where o.id = order_id and o.company_id = (select get_my_company_id())));
drop policy if exists "order_stops update" on order_stops;
create policy "order_stops update" on order_stops for update to authenticated
  using ((select has_order_permission())
    and exists (select 1 from orders o where o.id = order_id and o.company_id = (select get_my_company_id())))
  with check ((select has_order_permission())
    and exists (select 1 from orders o where o.id = order_id and o.company_id = (select get_my_company_id())));
drop policy if exists "order_stops delete" on order_stops;
create policy "order_stops delete" on order_stops for delete to authenticated
  using ((select has_order_permission())
    and exists (select 1 from orders o where o.id = order_id and o.company_id = (select get_my_company_id())));

drop policy if exists "order_services select" on order_services;
create policy "order_services select" on order_services for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and o.company_id = (select get_my_company_id())));
drop policy if exists "order_services insert" on order_services;
create policy "order_services insert" on order_services for insert to authenticated
  with check ((select has_order_permission())
    and exists (select 1 from orders o where o.id = order_id and o.company_id = (select get_my_company_id())));
drop policy if exists "order_services update" on order_services;
create policy "order_services update" on order_services for update to authenticated
  using ((select has_order_permission())
    and exists (select 1 from orders o where o.id = order_id and o.company_id = (select get_my_company_id())))
  with check ((select has_order_permission())
    and exists (select 1 from orders o where o.id = order_id and o.company_id = (select get_my_company_id())));
drop policy if exists "order_services delete" on order_services;
create policy "order_services delete" on order_services for delete to authenticated
  using ((select has_order_permission())
    and exists (select 1 from orders o where o.id = order_id and o.company_id = (select get_my_company_id())));

-- order_crew: сотрудник меняет свою строку (принял/прочитал)
drop policy if exists "order_crew select" on order_crew;
create policy "order_crew select" on order_crew for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and o.company_id = (select get_my_company_id())));
drop policy if exists "order_crew insert" on order_crew;
create policy "order_crew insert" on order_crew for insert to authenticated
  with check ((select has_order_permission())
    and exists (select 1 from orders o where o.id = order_id and o.company_id = (select get_my_company_id())));
drop policy if exists "order_crew update" on order_crew;
create policy "order_crew update" on order_crew for update to authenticated
  using (((select has_order_permission()) or employee_id = (select get_my_employee_id()))
    and exists (select 1 from orders o where o.id = order_id and o.company_id = (select get_my_company_id())))
  with check (((select has_order_permission()) or employee_id = (select get_my_employee_id()))
    and exists (select 1 from orders o where o.id = order_id and o.company_id = (select get_my_company_id())));
drop policy if exists "order_crew delete" on order_crew;
create policy "order_crew delete" on order_crew for delete to authenticated
  using ((select has_order_permission())
    and exists (select 1 from orders o where o.id = order_id and o.company_id = (select get_my_company_id())));

-- employee_schedule_days
drop policy if exists "employee_schedule_days select" on employee_schedule_days;
create policy "employee_schedule_days select" on employee_schedule_days for select to authenticated
  using (exists (select 1 from employees e where e.id = employee_id and e.company_id = (select get_my_company_id())));
drop policy if exists "employee_schedule_days insert" on employee_schedule_days;
create policy "employee_schedule_days insert" on employee_schedule_days for insert to authenticated
  with check (can_manage_schedule_for(employee_id)
    and exists (select 1 from employees e where e.id = employee_id and e.company_id = (select get_my_company_id())));
drop policy if exists "employee_schedule_days update" on employee_schedule_days;
create policy "employee_schedule_days update" on employee_schedule_days for update to authenticated
  using (can_manage_schedule_for(employee_id)
    and exists (select 1 from employees e where e.id = employee_id and e.company_id = (select get_my_company_id())))
  with check (can_manage_schedule_for(employee_id)
    and exists (select 1 from employees e where e.id = employee_id and e.company_id = (select get_my_company_id())));
drop policy if exists "employee_schedule_days delete" on employee_schedule_days;
create policy "employee_schedule_days delete" on employee_schedule_days for delete to authenticated
  using (can_manage_schedule_for(employee_id)
    and exists (select 1 from employees e where e.id = employee_id and e.company_id = (select get_my_company_id())));

-- driver_reports (условия — из 0019, без изменений)
drop policy if exists "driver_reports select" on driver_reports;
create policy "driver_reports select" on driver_reports for select to authenticated
  using (
    (employee_id = (select get_my_employee_id())
      and (report_date >= date_trunc('month', now() at time zone 'Europe/Moscow')::date
           or status in ('draft', 'rejected')
           or submitted_at > now() - interval '24 hours'))
    or ((select can_review_driver_reports())
      and company_id = (select get_my_company_id())
      and status <> 'draft')
  );
drop policy if exists "driver_reports delete" on driver_reports;
create policy "driver_reports delete" on driver_reports for delete to authenticated
  using (employee_id = (select get_my_employee_id()) and status = 'draft');

-- reminder_rules, services, sms_templates, vehicles
drop policy if exists "reminder_rules select" on reminder_rules;
create policy "reminder_rules select" on reminder_rules for select to authenticated
  using (company_id = (select get_my_company_id()));
drop policy if exists "reminder_rules write by admin" on reminder_rules;
create policy "reminder_rules write by admin" on reminder_rules for all to authenticated
  using ((select is_admin()) and company_id = (select get_my_company_id()))
  with check ((select is_admin()) and company_id = (select get_my_company_id()));

drop policy if exists "services select" on services;
create policy "services select" on services for select to authenticated
  using (company_id = (select get_my_company_id()));
drop policy if exists "services write by admin" on services;
create policy "services write by admin" on services for all to authenticated
  using ((select is_admin()) and company_id = (select get_my_company_id()))
  with check ((select is_admin()) and company_id = (select get_my_company_id()));

drop policy if exists "sms_templates select" on sms_templates;
create policy "sms_templates select" on sms_templates for select to authenticated
  using (company_id = (select get_my_company_id()));
drop policy if exists "sms_templates update by admin" on sms_templates;
create policy "sms_templates update by admin" on sms_templates for update to authenticated
  using ((select is_admin()) and company_id = (select get_my_company_id()))
  with check ((select is_admin()) and company_id = (select get_my_company_id()));

drop policy if exists "vehicles select" on vehicles;
create policy "vehicles select" on vehicles for select to authenticated
  using (company_id = (select get_my_company_id()));
drop policy if exists "vehicles insert" on vehicles;
create policy "vehicles insert" on vehicles for insert to authenticated
  with check ((select has_order_permission()) and company_id = (select get_my_company_id()));
drop policy if exists "vehicles update" on vehicles;
create policy "vehicles update" on vehicles for update to authenticated
  using ((select has_order_permission()) and company_id = (select get_my_company_id()))
  with check ((select has_order_permission()) and company_id = (select get_my_company_id()));
drop policy if exists "vehicles delete" on vehicles;
create policy "vehicles delete" on vehicles for delete to authenticated
  using ((select has_order_permission()) and company_id = (select get_my_company_id()));

-- support_tickets, support_ticket_messages
drop policy if exists "support_tickets select" on support_tickets;
create policy "support_tickets select" on support_tickets for select to authenticated
  using ((select is_service_owner()) or company_id = (select get_my_company_id()));
drop policy if exists "support_tickets insert" on support_tickets;
create policy "support_tickets insert" on support_tickets for insert to authenticated
  with check ((select is_admin())
    and company_id = (select get_my_company_id())
    and created_by = (select get_my_employee_id()));
drop policy if exists "support_tickets update" on support_tickets;
create policy "support_tickets update" on support_tickets for update to authenticated
  using ((select is_service_owner()) or ((select is_admin()) and company_id = (select get_my_company_id())))
  with check ((select is_service_owner()) or ((select is_admin()) and company_id = (select get_my_company_id())));

drop policy if exists "support_ticket_messages select" on support_ticket_messages;
create policy "support_ticket_messages select" on support_ticket_messages for select to authenticated
  using (exists (
    select 1 from support_tickets t
    where t.id = ticket_id
      and ((select is_service_owner()) or t.company_id = (select get_my_company_id()))
  ));
drop policy if exists "support_ticket_messages insert" on support_ticket_messages;
create policy "support_ticket_messages insert" on support_ticket_messages for insert to authenticated
  with check (
    sender_id = (select get_my_employee_id())
    and exists (
      select 1 from support_tickets t
      where t.id = ticket_id
        and ((select is_service_owner()) or ((select is_admin()) and t.company_id = (select get_my_company_id())))
    )
  );

-- ==========================================================================
-- 3. Индексы
-- ==========================================================================
-- Календарь и проверки занятости: заказы компании за период.
create index if not exists orders_company_start_idx on orders (company_id, scheduled_start);
create index if not exists orders_company_end_idx on orders (company_id, scheduled_end);
drop index if exists orders_company_id_idx;
-- История клиента по дате (и удаление клиента).
create index if not exists orders_client_start_idx on orders (client_id, scheduled_start);
drop index if exists orders_client_id_idx;
-- Статистика по сотруднику и удаление машины/сотрудника.
create index if not exists orders_created_by_idx on orders (created_by) where created_by is not null;
create index if not exists orders_vehicle_id_idx on orders (vehicle_id) where vehicle_id is not null;
-- Внешние ключи без индекса: удаление заказа, услуги, сотрудника, правила
-- перебирало эти таблицы целиком.
create index if not exists driver_report_orders_order_id_idx on driver_report_orders (order_id);
create index if not exists order_services_service_id_idx on order_services (service_id);
create index if not exists order_reminder_log_employee_id_idx on order_reminder_log (employee_id);
create index if not exists order_reminder_log_rule_id_idx on order_reminder_log (rule_id);
-- Очистка журнала напоминаний (claim_crew_reminders) — по давним записям.
create index if not exists order_reminder_log_sent_at_idx on order_reminder_log (sent_at);
create index if not exists support_tickets_created_by_idx on support_tickets (created_by);
create index if not exists support_ticket_messages_sender_id_idx on support_ticket_messages (sender_id);
create index if not exists driver_reports_confirmed_by_idx on driver_reports (confirmed_by) where confirmed_by is not null;
create index if not exists driver_reports_rejected_by_idx on driver_reports (rejected_by) where rejected_by is not null;
create index if not exists employees_default_vehicle_id_idx on employees (default_vehicle_id) where default_vehicle_id is not null;
-- Отчёты за месяц у проверяющего и счётчик «на проверке».
create index if not exists driver_reports_company_date_idx on driver_reports (company_id, report_date);
drop index if exists driver_reports_company_id_idx;
create index if not exists driver_reports_pending_idx on driver_reports (company_id, employee_id) where status = 'submitted';
-- Кто работает в этот день (форма заказа, график в кабинете).
create index if not exists employee_schedule_days_day_idx on employee_schedule_days (day);
-- Список клиентов по алфавиту.
create index if not exists clients_company_name_idx on clients (company_id, name);
drop index if exists clients_company_id_idx;
-- Дубль уникального employees_auth_user_id_key (миграция 0005).
drop index if exists employees_auth_user_id_idx;

-- ==========================================================================
-- 4. Триггеры и функции заказов: без политик на каждой строке
-- ==========================================================================
-- Проверки занятости видят все заказы своей компании (занятость не зависит
-- от того, кто меняет заказ) и ищут только заказы, пересекающиеся по
-- времени, а не всю историю сотрудника.

create or replace function check_employee_availability() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  conflict_order_id uuid;
begin
  select o.id into conflict_order_id
  from orders new_o
  join orders o
    on o.company_id = new_o.company_id
   and o.scheduled_end > new_o.scheduled_start
   and o.scheduled_start < new_o.scheduled_end
  join order_crew oc on oc.order_id = o.id and oc.employee_id = new.employee_id
  where new_o.id = new.order_id
    and new_o.status <> 'cancelled'
    and o.id <> new.order_id
    and o.status <> 'cancelled'
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
$$;

create or replace function check_orders_schedule_conflicts() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  conflict_order_id uuid;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  select o.id into conflict_order_id
  from order_crew new_oc
  join order_crew oc on oc.employee_id = new_oc.employee_id and oc.order_id <> new.id
  join orders o on o.id = oc.order_id
  where new_oc.order_id = new.id
    and o.company_id = new.company_id
    and o.scheduled_end > new.scheduled_start
    and o.scheduled_start < new.scheduled_end
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
$$;

-- Водитель без полного права на заказы меняет только время и сумму своего
-- заказа (0006/0016) — условия прежние, читает свою строку и бригаду
-- заказа напрямую, мимо политик.
create or replace function enforce_driver_order_update() returns trigger
language plpgsql security definer set search_path = public as $$
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

-- create_order: тот же код, автор заказа — через get_my_employee_id().
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
language plpgsql as $$
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
    get_my_employee_id(),
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

-- Частые адреса (0016): считаем по последним 2000 заказам компании, а не
-- по всей истории — у большой компании за год это десятки тысяч заказов, и
-- подсказка под полем адреса ждала почти 2 секунды. Для компании, у которой
-- заказов меньше 2000, результат прежний.
create or replace function recent_addresses(p_limit integer default 8)
returns table (address text, uses bigint)
language sql stable security definer set search_path = public as $$
  with recent as (
    select o.id, o.created_at
    from orders o
    where o.company_id = get_my_company_id()
    order by o.scheduled_start desc
    limit 2000
  )
  select os.address, count(*) as uses
  from recent o
  join order_stops os on os.order_id = o.id
  group by os.address
  order by count(*) desc, max(o.created_at) desc
  limit least(greatest(coalesce(p_limit, 8), 1), 50);
$$;

-- ==========================================================================
-- 5. Подсчёты на сервере вместо скачивания всех строк
-- ==========================================================================
-- «Выполнен» — не отменён и уже закончился (правило из lib/orderCompletion.ts
-- приложения и кабинета).

-- Статистика администратора: заказы по состоянию, выручка по выполненным и
-- то же по каждому сотруднику (в бригаде или автор заказа, один заказ
-- считается сотруднику один раз). Период — по дате начала, null — за всё
-- время. Возвращает один json, чтобы ответ не упирался в лимит строк API.
create or replace function company_order_stats(p_from timestamptz default null, p_to timestamptz default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_company uuid := get_my_company_id();
  v_result jsonb;
begin
  if v_company is null or not is_admin() then
    raise exception 'Статистика доступна только администратору' using errcode = '42501';
  end if;

  with o as (
    select id, actual_price, created_by,
           case when status = 'cancelled' then 'cancelled'
                when scheduled_end <= now() then 'completed'
                else 'active' end as bucket
    from orders
    where company_id = v_company
      and (p_from is null or scheduled_start >= p_from)
      and (p_to is null or scheduled_start < p_to)
  ),
  credited as (
    select o.id, o.bucket, o.actual_price, c.employee_id
    from o
    cross join lateral (
      select oc.employee_id from order_crew oc where oc.order_id = o.id
      union
      select o.created_by where o.created_by is not null
    ) c
  ),
  per_employee as (
    select employee_id,
           count(*) as orders,
           coalesce(sum(actual_price) filter (where bucket = 'completed'), 0) as revenue
    from credited
    group by employee_id
  )
  select jsonb_build_object(
    'total', (select count(*) from o),
    'active', (select count(*) from o where bucket = 'active'),
    'completed', (select count(*) from o where bucket = 'completed'),
    'cancelled', (select count(*) from o where bucket = 'cancelled'),
    'revenue', (select coalesce(sum(actual_price), 0) from o where bucket = 'completed'),
    'employees', coalesce(
      (select jsonb_agg(jsonb_build_object('employee_id', employee_id, 'orders', orders, 'revenue', revenue))
       from per_employee),
      '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
revoke execute on function company_order_stats(timestamptz, timestamptz) from public, anon;
grant execute on function company_order_stats(timestamptz, timestamptz) to authenticated;

-- Сводка по клиентам: заказов всего, выполненных, выручка по выполненным и
-- дата последнего заказа. p_client_id — один клиент (карточка клиента),
-- null — все клиенты компании, у которых есть заказы (кабинет выбирает
-- страницы, сортирует и фильтрует результат как обычную таблицу).
-- Доступ — как у «История и статистика по клиенту»: администратор или
-- галочка can_view_client_stats.
create or replace function client_stats(p_client_id uuid default null)
returns table (client_id uuid, orders_count bigint, completed_count bigint, revenue numeric, last_order_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (
    select 1 from employees
    where auth_user_id = auth.uid() and company_id is not null and (role = 'admin' or can_view_client_stats)
  ) then
    raise exception 'Нет доступа к статистике клиентов' using errcode = '42501';
  end if;

  return query
  select o.client_id,
         count(*),
         count(*) filter (where o.status <> 'cancelled' and o.scheduled_end <= now()),
         coalesce(sum(o.actual_price) filter (where o.status <> 'cancelled' and o.scheduled_end <= now()), 0),
         max(o.scheduled_start)
  from orders o
  where o.company_id = get_my_company_id()
    and o.client_id is not null
    and (p_client_id is null or o.client_id = p_client_id)
  group by o.client_id;
end;
$$;
revoke execute on function client_stats(uuid) from public, anon;
grant execute on function client_stats(uuid) to authenticated;

-- Отчёты водителей на проверке — число по каждому водителю компании (для
-- списка водителей у администратора и диспетчера).
create or replace function driver_reports_pending()
returns table (employee_id uuid, pending bigint)
language sql stable security definer set search_path = public as $$
  select r.employee_id, count(*)
  from driver_reports r
  where r.company_id = get_my_company_id()
    and r.status = 'submitted'
    and can_review_driver_reports()
  group by r.employee_id;
$$;
revoke execute on function driver_reports_pending() from public, anon;
grant execute on function driver_reports_pending() to authenticated;

-- Консоль владельца сервиса: сколько сотрудников в каждой компании —
-- одним json {company_id: число}, без лимита строк API.
create or replace function company_employee_counts()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(company_id, n), '{}'::jsonb)
  from (
    select e.company_id, count(*) as n
    from employees e
    where e.company_id is not null and is_service_owner()
    group by e.company_id
  ) t;
$$;
revoke execute on function company_employee_counts() from public, anon;
grant execute on function company_employee_counts() to authenticated;

-- ==========================================================================
-- 6. Напоминания (для функций send-crew-reminders и remind-driver-report,
--    только service role)
-- ==========================================================================

-- Отбирает, кому пора напомнить о заказе, и сразу отмечает это в
-- order_reminder_log — одним запросом, поэтому два запуска подряд не
-- напомнят дважды. Правило компании действует только на заказы этой
-- компании. Возвращает json-массив [{order_id, employee_id, offset_minutes,
-- scheduled_start, expo_push_token}] — без лимита строк API (правило «за
-- сутки» при первом запуске отбирает все заказы следующих суток).
-- Заодно чистит журнал: напоминания по заказам, начавшимся больше суток
-- назад, больше не нужны (раньше журнал рос без конца).
create or replace function claim_crew_reminders()
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_result jsonb;
  v_horizon timestamptz;
begin
  -- Напоминание приходит до начала заказа, поэтому по заказу, начавшемуся
  -- больше суток назад, оно отправлено тоже больше суток назад — это
  -- условие позволяет не перебирать весь журнал.
  delete from order_reminder_log l
  where l.sent_at < now() - interval '1 day'
    and exists (
      select 1 from orders o
      where o.id = l.order_id and o.scheduled_start < now() - interval '1 day'
    );

  -- Самое дальнее правило — чтобы база смотрела только ближайшие заказы,
  -- а не все будущие.
  select now() + make_interval(mins => max(offset_minutes))
  into v_horizon
  from reminder_rules
  where target = 'crew_push' and enabled;
  if v_horizon is null then
    return '[]'::jsonb;
  end if;

  with due as (
    select distinct on (o.id, oc.employee_id, r.id)
           o.id as order_id, oc.employee_id, r.id as rule_id, r.offset_minutes, o.scheduled_start
    from reminder_rules r
    join orders o
      on o.company_id = r.company_id
     and o.scheduled_start > now()
     and o.scheduled_start <= v_horizon
     and o.scheduled_start <= now() + make_interval(mins => r.offset_minutes)
     and o.status <> 'cancelled'
    join order_crew oc on oc.order_id = o.id
    where r.target = 'crew_push' and r.enabled
  ),
  claimed as (
    insert into order_reminder_log (order_id, employee_id, rule_id)
    select d.order_id, d.employee_id, d.rule_id from due d
    on conflict do nothing
    returning order_reminder_log.order_id, order_reminder_log.employee_id, order_reminder_log.rule_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'order_id', c.order_id,
           'employee_id', c.employee_id,
           'offset_minutes', d.offset_minutes,
           'scheduled_start', d.scheduled_start,
           'expo_push_token', e.expo_push_token)), '[]'::jsonb)
  into v_result
  from claimed c
  join due d on d.order_id = c.order_id and d.employee_id = c.employee_id and d.rule_id = c.rule_id
  join employees e on e.id = c.employee_id;

  return v_result;
end;
$$;
revoke execute on function claim_crew_reminders() from public, anon, authenticated;
grant execute on function claim_crew_reminders() to service_role;

-- Push-токены водителей, у которых в этот день (по Москве) был
-- неотменённый заказ, а отчёт за день ещё не отправлен. Массив, без лимита
-- строк API.
create or replace function driver_report_reminder_tokens(p_day date default null)
returns text[]
language sql stable security definer set search_path = public as $$
  with d as (
    select coalesce(p_day, (now() at time zone 'Europe/Moscow')::date) as day
  )
  select coalesce(array_agg(distinct e.expo_push_token), '{}')
  from d
  join orders o
    on o.scheduled_start >= (d.day::timestamp at time zone 'Europe/Moscow')
   and o.scheduled_start < ((d.day + 1)::timestamp at time zone 'Europe/Moscow')
   and o.status <> 'cancelled'
  join order_crew oc on oc.order_id = o.id and oc.role = 'driver'
  join employees e on e.id = oc.employee_id
  where e.expo_push_token is not null
    and not exists (
      select 1 from driver_reports r
      where r.employee_id = oc.employee_id
        and r.report_date = d.day
        and r.status in ('submitted', 'confirmed')
    );
$$;
revoke execute on function driver_report_reminder_tokens(date) from public, anon, authenticated;
grant execute on function driver_report_reminder_tokens(date) to service_role;

-- ==========================================================================
-- 7. Планы запросов API
-- ==========================================================================
-- API (PostgREST) готовит запросы заранее, и после нескольких вызовов база
-- может перейти на «общий» план — один на все компании и даты. На тестовой
-- базе (1000 компаний) с планом под каждый запрос календарь водителя
-- большой компании открывался вдвое быстрее, а самые медленные запросы в
-- общем потоке — на треть быстрее. Строить план заново стоит около
-- миллисекунды на запрос. PostgREST применяет настройки ролей сам.
alter role authenticated set plan_cache_mode = 'force_custom_plan';

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
