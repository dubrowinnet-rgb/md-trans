-- Правит 0021: веб-тред параллельно (та же задача Максима, 29.09) сделал
-- то же самое иначе — не новой колонкой deleted_at, а уже существующей
-- employees.account_status='suspended' (миграция 0001, была заведена, но
-- нигде не проверялась) + edge function deactivate-account. Их сторона
-- уже запушена и живёт на этом (веб-кабинет: «Уволить»/«Восстановить
-- доступ», useEmployees() фильтрует suspended, таблица «Команды» просто
-- гасит уволенного строку и показывает бейдж — сотрудник остаётся В
-- СПИСКЕ, не пропадает совсем, что удобнее моего варианта). 0021 никуда,
-- кроме этой ветки и песочницы, ещё не уходил — до продакшена Максима не
-- дошёл, откатывать безопасно.
--
-- Отменяем deleted_at, переходим на account_status — единый источник
-- правды для «активен ли сотрудник», без двух параллельных флагов.
alter table employees drop column if exists deleted_at;
drop index if exists employees_company_active_idx;

-- Тот же триггер (0014, расширен 0017, переопределён 0021) — без
-- deleted_at, и заодно защищаем администратора от случайной самоблокировки
-- через прямой PATCH (account_status), той же логикой, что уже есть для
-- role: раньше эта дыра была всегда (0017 её не закрывал), но раз уже
-- переопределяем функцию — закрываем заодно.
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
    if new.auth_user_id = auth.uid() and new.account_status is distinct from old.account_status then
      raise exception 'Нельзя изменить статус своего же аккаунта — попросите другого администратора'
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
  then
    raise exception 'Недостаточно прав для изменения роли, прав или ставки'
      using errcode = '42501';
  end if;

  return new;
end;
$$ language plpgsql security invoker;
