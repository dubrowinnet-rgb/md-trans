-- Продолжение рабочего графика (обсуждение в проекте, 2026-09-23, после
-- миграции 0007):
--   1. schedule_mode — подрабатывающий сам выбирает, как ему удобнее вести
--      свой график: отмечать выходные (как было) или отмечать рабочие дни.
--      Меняет только сам сотрудник на странице «Мой график» — RLS это уже
--      разрешает (auth_user_id = auth.uid(), миграция 0005), новых политик
--      не нужно. Для всех остальных остаётся 'mark_off' — сегодняшнее
--      поведение не меняется.
--   2. У отметки дня теперь явный статус ('on'/'off'), а не только факт
--      наличия строки — иначе смена режима задним числом меняла бы смысл
--      уже проставленных дней. Необязательные часы (start_time/end_time)
--      сужают рабочий статус до окна в течение дня; у выходного дня часов
--      не бывает (проверяем constraint'ом).
--   3. employee_days_off переименована в employee_schedule_days — старое
--      имя больше не точное, раз строка может означать и «рабочий день».
--   4. Перенос и копирование заказов и записей графика — это UI поверх
--      существующих прав, в БД ничего нового не нужно: «orders update» уже
--      разрешена любому с has_order_permission(), не только бригаде
--      (миграция 0006), а employee_schedule_days использует
--      can_manage_schedule_for() как и раньше.

alter table employees add column schedule_mode text not null default 'mark_off'
  check (schedule_mode in ('mark_off', 'mark_on'));
comment on column employees.schedule_mode is
  'mark_off: сотрудник отмечает выходные, остальные дни рабочие (по умолчанию). '
  'mark_on: сотрудник отмечает рабочие дни, остальные недоступен. '
  'Часы в employee_schedule_days действуют одинаково в обоих режимах.';

alter table employee_days_off rename to employee_schedule_days;

alter table employee_schedule_days add column status text not null default 'off'
  check (status in ('off', 'on'));
alter table employee_schedule_days add column start_time time;
alter table employee_schedule_days add column end_time time;
alter table employee_schedule_days add constraint employee_schedule_days_hours_need_on
  check (status = 'on' or (start_time is null and end_time is null));
alter table employee_schedule_days add constraint employee_schedule_days_time_range
  check (start_time is null or end_time is null or start_time < end_time);

drop policy "employee_days_off select" on employee_schedule_days;
drop policy "employee_days_off insert" on employee_schedule_days;
drop policy "employee_days_off delete" on employee_schedule_days;
-- select открыт всем — как и раньше, нужен для доступности бригады на
-- форме заказа (order/new.tsx).
create policy "employee_schedule_days select" on employee_schedule_days for select to authenticated using (true);
create policy "employee_schedule_days insert" on employee_schedule_days for insert to authenticated
  with check (can_manage_schedule_for(employee_id));
-- update — новое: раньше правку дня делали как delete+insert, теперь для
-- часов удобнее upsert на месте.
create policy "employee_schedule_days update" on employee_schedule_days for update to authenticated
  using (can_manage_schedule_for(employee_id)) with check (can_manage_schedule_for(employee_id));
create policy "employee_schedule_days delete" on employee_schedule_days for delete to authenticated
  using (can_manage_schedule_for(employee_id));
