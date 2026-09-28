-- Отчёты водителей — одна лента для водителя и администратора/диспетчера
-- (Максим, «Доработки 2», п. 1, 2026-09-28). Цель — прозрачность, чтобы
-- исключить обман, умышленный или случайный:
--
-- • Отчёт — как сообщение в ленте: время отправки (submitted_at) и, если
--   водитель потом правил, отдельной строкой время правки (edited_at). Ленту
--   видят оба — сам водитель и администратор/диспетчер его компании.
-- • Водитель правит свой отчёт 24 часа после отправки, дальше изменить его
--   нельзя. Исключение — несогласованный отчёт: его водитель исправляет и
--   отправляет заново. Согласованный отчёт не меняется.
-- • Администратор и диспетчер отчёт не правят: только согласуют
--   (approve_driver_report) или не согласуют с обязательным комментарием
--   (reject_driver_report).
-- • Водитель видит свои отчёты только за текущий месяц (по Москве), плюс
--   те, что ещё ждут его действий: черновик, несогласованный и отправленный
--   меньше 24 часов назад (иначе отчёт за 30-е, отправленный вечером,
--   нельзя было бы поправить 1-го числа).
-- • Черновик (ещё не отправленный отчёт) видит только сам водитель.
--
-- Писать в отчёты напрямую (insert/update в driver_reports и дочерние
-- таблицы) из приложения больше нельзя никому — только через функции ниже,
-- которые эти правила и проверяют. Иначе «24 часа» и «диспетчер не правит»
-- обходились бы прямым запросом к API.
--
-- Файл можно выполнить повторно.

-- ==========================================================================
-- Новые поля
-- ==========================================================================
alter table driver_reports add column if not exists submitted_at timestamptz;
alter table driver_reports add column if not exists edited_at timestamptz;
alter table driver_reports add column if not exists rejected_by uuid references employees (id);
alter table driver_reports add column if not exists rejected_at timestamptz;
alter table driver_reports add column if not exists rejection_comment text;

-- 'confirmed' остаётся значением «согласован» (так его уже пишет веб-кабинет
-- и хранят старые отчёты), новое — 'rejected', «не согласован».
alter table driver_reports drop constraint if exists driver_reports_status_check;
alter table driver_reports add constraint driver_reports_status_check
  check (status in ('draft', 'submitted', 'confirmed', 'rejected'));

-- Уже отправленным отчётам время отправки берём из времени создания —
-- точнее для старых строк не узнать. Больше 24 часов назад — значит,
-- водитель их уже не правит.
update driver_reports set submitted_at = created_at
where status in ('submitted', 'confirmed') and submitted_at is null;

-- ==========================================================================
-- Кто проверяет отчёты — администратор и диспетчер (раньше только
-- администратор). Та же форма, что can_create_orders() в 0016.
-- ==========================================================================
create or replace function can_review_driver_reports() returns boolean
language sql stable security invoker as $$
  select exists (
    select 1 from employees where auth_user_id = auth.uid() and role in ('admin', 'dispatcher')
  );
$$;

revoke execute on function can_review_driver_reports() from public;
grant execute on function can_review_driver_reports() to authenticated;

-- ==========================================================================
-- Чтение
-- ==========================================================================
drop policy if exists "driver_reports select" on driver_reports;
create policy "driver_reports select" on driver_reports for select to authenticated
  using (
    (
      employee_id = (select id from employees where auth_user_id = auth.uid())
      and (
        report_date >= date_trunc('month', now() at time zone 'Europe/Moscow')::date
        or status in ('draft', 'rejected')
        or submitted_at > now() - interval '24 hours'
      )
    )
    or (can_review_driver_reports() and company_id = get_my_company_id() and status <> 'draft')
  );

-- Строки заказов и расходов видны ровно тогда, когда виден сам отчёт:
-- подзапрос к driver_reports проходит через её же политику выше.
drop policy if exists "driver_report_orders select" on driver_report_orders;
create policy "driver_report_orders select" on driver_report_orders for select to authenticated
  using (exists (select 1 from driver_reports r where r.id = driver_report_orders.report_id));

drop policy if exists "driver_report_expenses select" on driver_report_expenses;
create policy "driver_report_expenses select" on driver_report_expenses for select to authenticated
  using (exists (select 1 from driver_reports r where r.id = driver_report_expenses.report_id));

-- ==========================================================================
-- Запись — только функциями ниже. Удалить свой черновик по-прежнему можно
-- (политика "driver_reports delete" из 0014 не меняется).
-- ==========================================================================
drop policy if exists "driver_reports insert" on driver_reports;
drop policy if exists "driver_reports update self" on driver_reports;
drop policy if exists "driver_reports update admin" on driver_reports;
drop policy if exists "driver_report_orders write" on driver_report_orders;
drop policy if exists "driver_report_expenses write" on driver_report_expenses;

-- Содержимое отчёта одной строкой — чтобы понять, изменил ли водитель
-- что-нибудь на самом деле (строка «Изменён» появляется только тогда).
-- security invoker: вызванная из приложения напрямую, видит только то, что
-- этому пользователю и так видно.
create or replace function driver_report_content(p_report_id uuid) returns jsonb
language sql stable security invoker as $$
  select jsonb_build_object(
    'fuel_amount', r.fuel_amount,
    'fuel_payment_method', r.fuel_payment_method,
    'odometer_photo_url', r.odometer_photo_url,
    'cash_handed_in', r.cash_handed_in,
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object('order_id', o.order_id, 'paid_by_transfer', o.paid_by_transfer) order by o.order_id)
      from driver_report_orders o where o.report_id = r.id
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object('description', e.description, 'amount', e.amount) order by e.description, e.amount)
      from driver_report_expenses e where e.report_id = r.id
    ), '[]'::jsonb)
  )
  from driver_reports r
  where r.id = p_report_id;
$$;

-- ==========================================================================
-- save_driver_report — водитель сохраняет свой отчёт за день целиком
-- (заказы, расходы, топливо, фото одометра, сдано в кассу). p_submit=false —
-- черновик, true — отправить (или отправить исправление).
--   p_orders   — [{"order_id": "...", "paid_by_transfer": false}, ...]
--   p_expenses — [{"description": "...", "amount": 500}, ...]
-- Возвращает id отчёта.
-- ==========================================================================
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
    -- Текущий месяц, а 1-го числа ещё и вчерашний день (последний день
    -- прошлого месяца — вечерний отчёт, дописанный после полуночи).
    if p_report_date < least(date_trunc('month', v_today)::date, v_today - 1) then
      raise exception 'Отчёт можно написать только за текущий месяц';
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
    -- Правка отправленного или исправление несогласованного: статус снова
    -- «на проверке», строка «Изменён» — только если что-то поменялось.
    -- Замечание прошлой проверки (rejected_*) остаётся — видно, что было
    -- не так и когда исправлено.
    v_after := driver_report_content(v_report.id);
    update driver_reports set
      status = 'submitted',
      edited_at = case when v_after is distinct from v_before then now() else edited_at end
    where id = v_report.id;
  end if;

  return v_report.id;
end;
$$;

revoke execute on function save_driver_report(date, boolean, jsonb, jsonb, numeric, text, text, numeric) from public;
grant execute on function save_driver_report(date, boolean, jsonb, jsonb, numeric, text, text, numeric) to authenticated;

-- ==========================================================================
-- Проверка администратором или диспетчером своей компании. Оба действия —
-- только для отчёта «на проверке» (status = 'submitted').
-- ==========================================================================
create or replace function approve_driver_report(p_report_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_reviewer_id uuid;
  v_status text;
begin
  select id into v_reviewer_id from employees
  where auth_user_id = auth.uid() and role in ('admin', 'dispatcher');
  if v_reviewer_id is null then
    raise exception 'Согласовывать отчёты может только администратор или диспетчер' using errcode = '42501';
  end if;

  select status into v_status from driver_reports
  where id = p_report_id and company_id = get_my_company_id()
  for update;
  if v_status is null then
    raise exception 'Отчёт не найден';
  end if;
  if v_status <> 'submitted' then
    raise exception 'Согласовать можно только отчёт, который ждёт проверки';
  end if;

  update driver_reports
  set status = 'confirmed', confirmed_by = v_reviewer_id, confirmed_at = now()
  where id = p_report_id;
end;
$$;

create or replace function reject_driver_report(p_report_id uuid, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_reviewer_id uuid;
  v_status text;
begin
  select id into v_reviewer_id from employees
  where auth_user_id = auth.uid() and role in ('admin', 'dispatcher');
  if v_reviewer_id is null then
    raise exception 'Проверять отчёты может только администратор или диспетчер' using errcode = '42501';
  end if;
  if coalesce(btrim(p_comment), '') = '' then
    raise exception 'Напишите комментарий: что водителю нужно исправить';
  end if;

  select status into v_status from driver_reports
  where id = p_report_id and company_id = get_my_company_id()
  for update;
  if v_status is null then
    raise exception 'Отчёт не найден';
  end if;
  if v_status <> 'submitted' then
    raise exception 'Не согласовать можно только отчёт, который ждёт проверки';
  end if;

  update driver_reports
  set status = 'rejected', rejected_by = v_reviewer_id, rejected_at = now(), rejection_comment = left(btrim(p_comment), 1000)
  where id = p_report_id;
end;
$$;

revoke execute on function approve_driver_report(uuid) from public;
revoke execute on function reject_driver_report(uuid, text) from public;
grant execute on function approve_driver_report(uuid) to authenticated;
grant execute on function reject_driver_report(uuid, text) to authenticated;
