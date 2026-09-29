-- Удаление сотрудника из «Команды» (Максим, 2026-09-29, список в веб-треде,
-- пункт 1) + защита от дублей телефона/имени (пункт 2, проверка — в
-- create-account/update-account, здесь только колонка и её защита).
--
-- Сотрудника не удаляем физически: на него ссылаются его прошлые заказы
-- (order_crew, orders.created_by), отчёты водителя, зарплата, обращения в
-- поддержку — жёсткое удаление либо стёрло бы эту историю (on delete
-- cascade), либо вовсе не прошло бы (сейчас на этих таблицах no action, и
-- DELETE упал бы с ошибкой внешнего ключа у любого сотрудника с историей).
-- Вместо этого — deleted_at: строка остаётся (история и отчёты по ней
-- считаются как прежде), но:
--   • Edge Function delete-account (новая) блокирует вход через GoTrue
--     (ban_duration) — тем же путём, что и остальные админские действия
--     над чужим логином (service role, см. update-account);
--   • «Команда» и выбор экипажа (mobile: useAllAccounts/useEmployees, веб:
--     свой эквивалент) перестают показывать такого сотрудника — это правит
--     код приложений, не RLS: исторические записи (кто был в бригаде,
--     кто создал заказ) должны по-прежнему показывать его имя админу той
--     же компании, поэтому политика «employees select» deleted_at не
--     фильтрует.
alter table employees add column if not exists deleted_at timestamptz;

comment on column employees.deleted_at is
  'Не физическое удаление — сотрудник скрыт из «Команды» и выбора экипажа, вход заблокирован (GoTrue ban), но история (заказы, отчёты, зарплата) на него по-прежнему ссылается.';

-- Только «активная» команда — для списков и подсчёта прав (например,
-- «остался ли ещё хоть один администратор» в самой функции удаления).
create index if not exists employees_company_active_idx
  on employees (company_id) where deleted_at is null;

-- ==========================================================================
-- Расширяем самозащитный триггер (0014, переопределён в 0017): deleted_at
-- меняет только Edge Function delete-account (service role, auth.uid() is
-- null — триггер её пропускает, как и раньше пропускал update-account).
-- Прямым PATCH через RLS (обычный вход, не service role) — ни сотрудник
-- себе, ни администратор себе самому это поле поменять не может.
-- ==========================================================================
create or replace function restrict_employee_self_role_change() returns trigger as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if is_admin() then
    if new.auth_user_id = auth.uid() and new.role is distinct from old.role then
      raise exception 'Нельзя изменить собственную роль администратора'
        using errcode = '42501';
    end if;
    if new.auth_user_id = auth.uid() and new.deleted_at is distinct from old.deleted_at then
      raise exception 'Нельзя удалить самого себя — попросите другого администратора'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.company_id is distinct from old.company_id
     or new.hourly_rate is distinct from old.hourly_rate
     or new.driving_hourly_rate is distinct from old.driving_hourly_rate
     or new.loading_hourly_rate is distinct from old.loading_hourly_rate
     or new.rate_mode is distinct from old.rate_mode
     or new.can_manage_orders is distinct from old.can_manage_orders
     or new.can_view_client_stats is distinct from old.can_view_client_stats
     or new.can_view_contacts_and_amounts is distinct from old.can_view_contacts_and_amounts
     or new.can_manage_own_schedule is distinct from old.can_manage_own_schedule
     or new.can_edit_order_schedule_and_price is distinct from old.can_edit_order_schedule_and_price
     or new.default_vehicle_id is distinct from old.default_vehicle_id
     or new.account_status is distinct from old.account_status
     or new.paid_until is distinct from old.paid_until
     or new.monthly_price is distinct from old.monthly_price
     or new.deleted_at is distinct from old.deleted_at
  then
    raise exception 'Недостаточно прав для изменения роли, прав или ставки'
      using errcode = '42501';
  end if;

  return new;
end;
$$ language plpgsql security invoker;
