-- Лента уведомлений (0024) не получала запись о самом назначении на
-- заказ — ни о новом заказе, ни о добавлении в бригаду уже существующего
-- (useCreateOrder/useUpdateOrderCrew шлют push напрямую с клиента, но в
-- notifications ничего не писали; notify_order_changed — AFTER UPDATE,
-- на INSERT не срабатывает, см. комментарий в 0015). Максим (01.10):
-- «пришедшие заказы должны отображаться там». Добавляем так же, как
-- остальные виды — триггером в базе (security definer, мимо RLS), общим
-- для обоих клиентов и для создания заказа, и для более позднего
-- добавления в бригаду (оба пути вставляют строку в order_crew).
--
-- Файл можно выполнить повторно.

alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('order_changed', 'order_cancelled', 'report_approved', 'report_rejected', 'support_reply', 'order_assigned'));

create or replace function notify_order_assigned() returns trigger as $$
declare
  v_company_id uuid;
  v_scheduled_start timestamptz;
begin
  select company_id, scheduled_start into v_company_id, v_scheduled_start
  from orders where id = new.order_id;

  -- Заказ мог быть уже удалён в этой же транзакции (маловероятно, но без
  -- company_id вставка всё равно упадёт на not null) — просто выходим.
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
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists order_crew_notify_assigned on order_crew;
create trigger order_crew_notify_assigned
  after insert on order_crew
  for each row
  execute function notify_order_assigned();
