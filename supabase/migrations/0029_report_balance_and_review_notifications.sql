-- Правки 6 (01.10), часть серверных изменений:
--   п.5  — пуш при назначении/замене в бригаде теперь шлёт САМ триггер
--          (а не клиент), чтобы работал одинаково из мобильного и веб-кабинета.
--   п.13 — диспетчеру/администратору приходит уведомление, когда исполнитель
--          принял заказ.
--   п.19 — «Остаток у водителя» нарастающим итогом (а не расхождение за
--          один день) — функция считает сама, в обход RLS, см. ниже почему.
--   п.21 — диспетчеру/администратору приходит уведомление о новом/
--          исправленном отчёте водителя.
--   п.22 — отчёт можно написать за прошлый месяц, если не писали (не только
--          текущий).
--   п.24 — водитель видит свои отчёты за текущий и предыдущий месяц (не
--          только текущий) — та же граница, что и у п.22.
--   п.25 — диспетчер/администратор может открыть согласованный отчёт для
--          исправления.
--
-- Файл можно выполнить повторно.

-- ==========================================================================
-- 0. Новые виды уведомлений.
-- ==========================================================================
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in (
    'order_changed', 'order_cancelled', 'report_approved', 'report_rejected',
    'support_reply', 'order_assigned', 'order_confirmed', 'report_submitted', 'report_reopened'
  ));

-- ==========================================================================
-- 1. П.24/22 — окно видимости и правки отчётов: текущий месяц + предыдущий
--    целиком (было — только текущий, 1-го числа ещё и вчера).
-- ==========================================================================
drop policy if exists "driver_reports select" on driver_reports;
create policy "driver_reports select" on driver_reports for select to authenticated
  using (
    (
      employee_id = (select id from employees where auth_user_id = auth.uid())
      and (
        report_date >= (date_trunc('month', now() at time zone 'Europe/Moscow') - interval '1 month')::date
        or status in ('draft', 'rejected')
        or submitted_at > now() - interval '24 hours'
      )
    )
    or (can_review_driver_reports() and company_id = get_my_company_id() and status <> 'draft')
  );

create or replace function save_driver_report(
  p_report_date date,
  p_submit boolean,
  p_orders jsonb default '[]'::jsonb,
  p_expenses jsonb default '[]'::jsonb,
  p_fuel_amount numeric default null,
  p_fuel_payment_method text default null,
  p_odometer_photo_url text default null,
  p_cash_handed_in numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_employee_id uuid;
  v_company_id uuid;
  v_today date := (now() at time zone 'Europe/Moscow')::date;
  v_report driver_reports%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_foreign_orders int;
begin
  select id, company_id into v_employee_id, v_company_id
  from employees where auth_user_id = auth.uid() and role = 'driver';
  if v_employee_id is null or v_company_id is null then
    raise exception 'Отчёт пишет только водитель' using errcode = '42501';
  end if;

  select count(*) into v_foreign_orders
  from jsonb_array_elements(coalesce(p_orders, '[]'::jsonb)) o
  where not exists (
    select 1 from orders where orders.id = (o ->> 'order_id')::uuid and orders.company_id = v_company_id
  );
  if v_foreign_orders > 0 then
    raise exception 'В отчёте заказ не из вашей компании' using errcode = '42501';
  end if;

  select * into v_report from driver_reports
  where employee_id = v_employee_id and report_date = p_report_date
  for update;

  if v_report.id is null then
    if p_report_date > v_today then
      raise exception 'Нельзя написать отчёт за день, который ещё не наступил';
    end if;
    -- Правки 6, п.22: не только текущий месяц — ещё и весь предыдущий, если
    -- водитель почему-то не писал отчёт день в день.
    if p_report_date < (date_trunc('month', v_today) - interval '1 month')::date then
      raise exception 'Отчёт можно написать только за текущий или предыдущий месяц';
    end if;
    insert into driver_reports (company_id, employee_id, report_date, status)
    values (v_company_id, v_employee_id, p_report_date, 'draft')
    returning * into v_report;
  else
    if v_report.status = 'confirmed' then
      raise exception 'Отчёт уже согласован, изменить его нельзя';
    end if;
    if v_report.status = 'submitted' and v_report.submitted_at <= now() - interval '24 hours' then
      raise exception 'Прошло больше 24 часов после отправки, изменить отчёт нельзя';
    end if;
    if v_report.status in ('submitted', 'rejected') and not p_submit then
      raise exception 'Отправленный отчёт нельзя вернуть в черновик';
    end if;
    v_before := driver_report_content(v_report.id);
  end if;

  update driver_reports set
    fuel_amount = p_fuel_amount,
    fuel_payment_method = p_fuel_payment_method,
    odometer_photo_url = p_odometer_photo_url,
    cash_handed_in = p_cash_handed_in
  where id = v_report.id;

  delete from driver_report_orders where report_id = v_report.id;
  insert into driver_report_orders (report_id, order_id, paid_by_transfer)
  select distinct on ((o ->> 'order_id')::uuid)
    v_report.id, (o ->> 'order_id')::uuid, coalesce((o ->> 'paid_by_transfer')::boolean, false)
  from jsonb_array_elements(coalesce(p_orders, '[]'::jsonb)) o;

  delete from driver_report_expenses where report_id = v_report.id;
  insert into driver_report_expenses (report_id, description, amount)
  select v_report.id, btrim(e ->> 'description'), (e ->> 'amount')::numeric
  from jsonb_array_elements(coalesce(p_expenses, '[]'::jsonb)) e
  where coalesce(btrim(e ->> 'description'), '') <> '';

  if v_report.status = 'draft' then
    if p_submit then
      update driver_reports set status = 'submitted', submitted_at = now() where id = v_report.id;
    end if;
  else
    v_after := driver_report_content(v_report.id);
    update driver_reports set
      status = 'submitted',
      edited_at = case when v_after is distinct from v_before then now() else edited_at end
    where id = v_report.id;
  end if;

  return v_report.id;
end;
$$;

-- ==========================================================================
-- 2. П.19 — остаток у водителя нарастающим итогом. SECURITY DEFINER —
--    водителю RLS отдаёт только 2 последних месяца (см. выше), а остаток
--    должен быть верным и за более старую историю; функция сама проверяет,
--    что вызывающий — либо этот же водитель, либо проверяющий его компании.
--    Формула — та же, что в withTotals (mobile/src/api/driverReports.ts,
--    web/src/api/driverReports.ts), посчитана в SQL по тем же правилам
--    (ревью, задача 3: без отменённых заказов и заказов переводом).
-- ==========================================================================
create or replace function driver_report_running_balance(p_employee_id uuid, p_as_of_date date default null)
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  v_caller_id uuid;
  v_caller_company_id uuid;
  v_target_company_id uuid;
  v_balance numeric;
begin
  select id, company_id into v_caller_id, v_caller_company_id from employees where auth_user_id = auth.uid();
  select company_id into v_target_company_id from employees where id = p_employee_id;

  if v_caller_id is null or v_target_company_id is null then
    return null;
  end if;
  if v_caller_id <> p_employee_id and not (can_review_driver_reports() and v_caller_company_id = v_target_company_id) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;

  select coalesce(sum(
    coalesce((
      select sum(o.actual_price)
      from driver_report_orders dro
      join orders o on o.id = dro.order_id
      where dro.report_id = r.id
        and o.status <> 'cancelled'
        and dro.paid_by_transfer = false
        and coalesce(o.actual_price, 0) > 0
    ), 0)
    - coalesce((select sum(e.amount) from driver_report_expenses e where e.report_id = r.id), 0)
    - case when r.fuel_payment_method = 'cash' then coalesce(r.fuel_amount, 0) else 0 end
    - coalesce(r.cash_handed_in, 0)
  ), 0) into v_balance
  from driver_reports r
  where r.employee_id = p_employee_id
    and r.status in ('submitted', 'confirmed')
    and (p_as_of_date is null or r.report_date <= p_as_of_date);

  return v_balance;
end;
$$;

revoke execute on function driver_report_running_balance(uuid, date) from public;
grant execute on function driver_report_running_balance(uuid, date) to authenticated;

-- ==========================================================================
-- 3. П.25 — открыть согласованный отчёт для исправления: статус обратно в
--    «на проверке» (переиспользуем submitted — так же, как «не согласовать»
--    уже обходится без отдельного «locked»-состояния), согласованный раньше
--    остаётся виден в confirmed_by/confirmed_at. После исправления отчёт
--    снова проходит обычное согласование.
-- ==========================================================================
create or replace function reopen_driver_report(p_report_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_reviewer_id uuid;
  v_status text;
  v_employee_id uuid;
  v_report_date date;
begin
  select id into v_reviewer_id from employees
  where auth_user_id = auth.uid() and role in ('admin', 'dispatcher');
  if v_reviewer_id is null then
    raise exception 'Открыть отчёт для правки может только администратор или диспетчер' using errcode = '42501';
  end if;

  select status, employee_id, report_date into v_status, v_employee_id, v_report_date from driver_reports
  where id = p_report_id and company_id = get_my_company_id()
  for update;
  if v_status is null then
    raise exception 'Отчёт не найден';
  end if;
  if v_status <> 'confirmed' then
    raise exception 'Открыть для правки можно только согласованный отчёт';
  end if;

  update driver_reports
  set status = 'submitted', submitted_at = now(), edited_at = null
  where id = p_report_id;

  insert into notifications (company_id, employee_id, kind, title, body, driver_report_id)
  values (
    get_my_company_id(), v_employee_id, 'report_reopened', 'Отчёт открыт для исправления',
    'Отчёт за ' || to_char(v_report_date, 'DD.MM') || ' открыт для исправления — проверьте и отправьте заново', p_report_id
  );
end;
$$;

revoke execute on function reopen_driver_report(uuid) from public;
grant execute on function reopen_driver_report(uuid) to authenticated;

-- ==========================================================================
-- 4. П.21 — новый/исправленный отчёт водителя -> уведомление администратору
--    и диспетчеру компании (не водителю — он и так знает, что отправил).
-- ==========================================================================
create or replace function notify_driver_report_submitted() returns trigger as $$
declare
  v_employee_name text;
begin
  select name into v_employee_name from employees where id = new.employee_id;

  insert into notifications (company_id, employee_id, kind, title, body, driver_report_id)
  select new.company_id, e.id, 'report_submitted',
    case when old.status = 'rejected' then 'Отчёт исправлен' else 'Новый отчёт водителя' end,
    coalesce(v_employee_name, 'Водитель') || ': отчёт за ' || to_char(new.report_date, 'DD.MM'),
    new.id
  from employees e
  where e.company_id = new.company_id and e.role in ('admin', 'dispatcher');

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists driver_reports_notify_submitted on driver_reports;
create trigger driver_reports_notify_submitted
  after update on driver_reports
  for each row
  when (new.status = 'submitted' and old.status is distinct from 'submitted')
  execute function notify_driver_report_submitted();

-- ==========================================================================
-- 5. П.13 — исполнитель принял заказ («принял») -> уведомление
--    администратору и диспетчеру компании.
-- ==========================================================================
create or replace function notify_order_crew_confirmed() returns trigger as $$
declare
  v_company_id uuid;
  v_scheduled_start timestamptz;
  v_employee_name text;
begin
  select company_id, scheduled_start into v_company_id, v_scheduled_start from orders where id = new.order_id;
  if v_company_id is null then
    return new;
  end if;
  select name into v_employee_name from employees where id = new.employee_id;

  insert into notifications (company_id, employee_id, kind, title, body, order_id)
  select v_company_id, e.id, 'order_confirmed', 'Заказ принят',
    coalesce(v_employee_name, 'Сотрудник') || ' принял(а) заказ на '
      || to_char(v_scheduled_start at time zone 'Europe/Moscow', 'DD.MM')
      || ' в ' || to_char(v_scheduled_start at time zone 'Europe/Moscow', 'HH24:MI'),
    new.order_id
  from employees e
  where e.company_id = v_company_id and e.role in ('admin', 'dispatcher');

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists order_crew_notify_confirmed on order_crew;
create trigger order_crew_notify_confirmed
  after update on order_crew
  for each row
  when (old.status is distinct from 'confirmed' and new.status = 'confirmed')
  execute function notify_order_crew_confirmed();

-- ==========================================================================
-- 6. П.5 — пуш при назначении в бригаду (новый заказ или замена) теперь
--    шлёт сам триггер (как notify_order_changed), а не клиент: раньше это
--    делали useCreateOrder/useUpdateOrderCrew на мобильном (см. 0027), и
--    веб-кабинет push вообще не отправлял — отсюда «нет пуша при замене»,
--    если правку делали из веб-кабинета. Теперь одинаково для обоих
--    клиентов; мобильный клиент свой прямой вызов push для этого случая
--    убирает отдельным изменением (api/orders.ts), чтобы не слать дважды.
-- ==========================================================================
create or replace function notify_order_assigned() returns trigger as $$
declare
  v_company_id uuid;
  v_scheduled_start timestamptz;
begin
  select company_id, scheduled_start into v_company_id, v_scheduled_start
  from orders where id = new.order_id;

  if v_company_id is null then
    return new;
  end if;

  insert into notifications (company_id, employee_id, kind, title, body, order_id)
  values (
    v_company_id, new.employee_id, 'order_assigned', 'Новый заказ',
    'Вам назначен заказ на ' || to_char(v_scheduled_start at time zone 'Europe/Moscow', 'DD.MM')
      || ' в ' || to_char(v_scheduled_start at time zone 'Europe/Moscow', 'HH24:MI'),
    new.order_id
  );

  perform private.call_edge_function(
    'notify-order-assigned',
    jsonb_build_object('employee_id', new.employee_id, 'order_id', new.order_id)
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;
