-- Лента уведомлений в меню сотрудника (Максим, «Правки 3» п.5; подтвердил
-- делать сейчас 30.09 вечером, вместе со сжатием сетки). Три вида события
-- уже шлют push (изменение/отмена заказа — 0015/0018; «не согласовать»
-- отчёт — 0019, из приложения) плюс новое — «согласовать» отчёт, раньше
-- вообще без уведомления. Каждое теперь ещё и сохраняется как личная
-- запись сотрудника: push можно пропустить (нет токена, офлайн, не тот
-- момент), а лента остаётся в приложении и всегда открыта. Читает её
-- только сам сотрудник со своего сервера — в отличие от текста push
-- (152-ФЗ, см. комментарии в 0013/0015/0019), сюда можно писать подробности
-- (например комментарий администратора при «не согласовать») — это не
-- выходит за пределы РФ.
--
-- Вставляют записи только функции ниже (security definer, мимо RLS) —
-- сотрудник не может создать уведомление сам, только отметить своё
-- прочитанным.
--
-- Файл можно выполнить повторно.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  kind text not null check (kind in ('order_changed', 'order_cancelled', 'report_approved', 'report_rejected')),
  title text not null,
  body text not null,
  order_id uuid references orders (id) on delete set null,
  driver_report_id uuid references driver_reports (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_employee_created_idx on notifications (employee_id, created_at desc);

alter table notifications enable row level security;

drop policy if exists "notifications select own" on notifications;
create policy "notifications select own" on notifications for select to authenticated
  using (employee_id = (select get_my_employee_id()));

-- Обновление — только чтобы отметить прочитанным (read_at); приложение
-- отмечает всю ленту при открытии экрана, одним запросом.
drop policy if exists "notifications update own" on notifications;
create policy "notifications update own" on notifications for update to authenticated
  using (employee_id = (select get_my_employee_id()))
  with check (employee_id = (select get_my_employee_id()));

-- ==========================================================================
-- Изменение/отмена заказа — та же триггерная функция, что в 0015/0018,
-- дополнена записью в ленту всем исполнителям; сам push (вызов
-- notify-order-changed) не меняется.
-- ==========================================================================
create or replace function notify_order_changed() returns trigger as $$
declare
  v_cancelled boolean;
  v_title text;
  v_body text;
begin
  v_cancelled := (new.status = 'cancelled' and old.status is distinct from 'cancelled');
  v_title := case when v_cancelled then 'Заказ отменён' else 'Изменения в заказе' end;
  v_body := case when v_cancelled
    then 'Заказ на ' || to_char(new.scheduled_start at time zone 'Europe/Moscow', 'DD.MM')
      || ' в ' || to_char(new.scheduled_start at time zone 'Europe/Moscow', 'HH24:MI') || ' отменён'
    else 'Заказ на ' || to_char(new.scheduled_start at time zone 'Europe/Moscow', 'DD.MM')
      || ' в ' || to_char(new.scheduled_start at time zone 'Europe/Moscow', 'HH24:MI') || ': обновлена информация'
  end;

  insert into notifications (company_id, employee_id, kind, title, body, order_id)
  select new.company_id, oc.employee_id, case when v_cancelled then 'order_cancelled' else 'order_changed' end, v_title, v_body, new.id
  from order_crew oc
  where oc.order_id = new.id;

  perform private.call_edge_function(
    'notify-order-changed',
    jsonb_build_object('order_id', new.id, 'cancelled', v_cancelled)
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ==========================================================================
-- Решение по отчёту водителя — те же функции, что в 0019, дополнены
-- записью в ленту. Push при «не согласовать» по-прежнему шлёт клиент
-- (useRejectDriverReport, без текста комментария — тот же 152-ФЗ довод);
-- «согласовать» новым push не обзаводится — Максим просил только ленту.
-- ==========================================================================
create or replace function approve_driver_report(p_report_id uuid) returns void
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
    raise exception 'Согласовывать отчёты может только администратор или диспетчер' using errcode = '42501';
  end if;

  select status, employee_id, report_date into v_status, v_employee_id, v_report_date from driver_reports
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

  insert into notifications (company_id, employee_id, kind, title, body, driver_report_id)
  values (
    get_my_company_id(), v_employee_id, 'report_approved', 'Отчёт согласован',
    'Отчёт за ' || to_char(v_report_date, 'DD.MM') || ' согласован', p_report_id
  );
end;
$$;

create or replace function reject_driver_report(p_report_id uuid, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_reviewer_id uuid;
  v_status text;
  v_employee_id uuid;
  v_report_date date;
  v_comment text;
begin
  select id into v_reviewer_id from employees
  where auth_user_id = auth.uid() and role in ('admin', 'dispatcher');
  if v_reviewer_id is null then
    raise exception 'Проверять отчёты может только администратор или диспетчер' using errcode = '42501';
  end if;
  if coalesce(btrim(p_comment), '') = '' then
    raise exception 'Напишите комментарий: что водителю нужно исправить';
  end if;
  v_comment := left(btrim(p_comment), 1000);

  select status, employee_id, report_date into v_status, v_employee_id, v_report_date from driver_reports
  where id = p_report_id and company_id = get_my_company_id()
  for update;
  if v_status is null then
    raise exception 'Отчёт не найден';
  end if;
  if v_status <> 'submitted' then
    raise exception 'Не согласовать можно только отчёт, который ждёт проверки';
  end if;

  update driver_reports
  set status = 'rejected', rejected_by = v_reviewer_id, rejected_at = now(), rejection_comment = v_comment
  where id = p_report_id;

  insert into notifications (company_id, employee_id, kind, title, body, driver_report_id)
  values (
    get_my_company_id(), v_employee_id, 'report_rejected', 'Отчёт не согласован',
    'Отчёт за ' || to_char(v_report_date, 'DD.MM') || ' не согласован: ' || v_comment, p_report_id
  );
end;
$$;

revoke execute on function approve_driver_report(uuid) from public;
revoke execute on function reject_driver_report(uuid, text) from public;
grant execute on function approve_driver_report(uuid) to authenticated;
grant execute on function reject_driver_report(uuid, text) to authenticated;
