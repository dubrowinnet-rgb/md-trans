-- ==========================================================================
-- 0017 — запрет самовыдачи прав (ревью 26.09.2026, задача 1).
--
-- Политика «employees update» (0013) разрешает сотруднику менять свою же
-- строку (auth_user_id = auth.uid()) — это нужно для служебных полей
-- (expo_push_token пишет pushNotifications.ts, schedule_mode — schedule.ts).
-- Но триггер restrict_employee_self_role_change (0014) перехватывал только
-- роль, компанию и ставки. Значит любой вошедший сотрудник мог прямым
-- PATCH к /rest/v1/employees выставить себе can_manage_orders = true и
-- получить права диспетчера (редактирование и удаление ЛЮБОГО заказа и
-- машины своей компании через has_order_permission()), а также включить
-- себе право видеть телефоны/суммы, менять время и сумму своего заказа,
-- свой график, снять себе приостановку (account_status) или отодвинуть
-- дату оплаты (paid_until). Данные ЧУЖОЙ компании это не открывает
-- (company_id под тем же запретом), но внутри своей — полная эскалация.
--
-- Расширяем тот же триггер: не-администратор не может менять НИ ОДНО из
-- чувствительных полей своей строки. Разрешёнными для самостоятельной
-- записи остаются только служебные (expo_push_token, schedule_mode,
-- last_location) — их приложение и пишет напрямую; всё остальное про
-- сотрудника меняется администратором (RLS ограничивает его своей
-- компанией) либо через Edge Function update-account (service role, там
-- auth.uid() = null и триггер, как и прежде, пропускает — профиль правит
-- сам сотрудник в «Настройках»).
--
-- Заодно: администратор не может снять роль 'admin' с самого себя —
-- иначе можно случайно оставить компанию без единого администратора
-- (ревью, задача 1; находка веб-кабинета про «Мои данные»). Сменить роль
-- ДРУГИМ он по-прежнему может.
-- ==========================================================================
create or replace function restrict_employee_self_role_change() returns trigger as $$
begin
  -- Вне контекста реального пользователя (SQL Editor, service role, сами
  -- миграции) auth.uid() = null — ограничение не применяется, как и везде.
  if auth.uid() is null then
    return new;
  end if;

  -- Администратор не может разжаловать сам себя — защита от «остались без
  -- админа». Остальное ниже его не касается (RLS и так держит его в своей
  -- компании, а ставки/права другим он менять вправе).
  if is_admin() then
    if new.auth_user_id = auth.uid() and new.role is distinct from old.role then
      raise exception 'Нельзя изменить собственную роль администратора'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Не-администратор: своя строка может меняться только в служебных полях.
  -- Любая правка роли, компании, ставок, прав или биллинга — запрет.
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

-- Триггер уже создан в 0014 на ту же функцию — переопределять не нужно.
