-- «Правки 4» (Максим, 01.10, веб-тред, relay в мобильный): живые обновления
-- без перезагрузки (п.5), удаление уволенного из списка сотрудников (п.4),
-- адрес погрузки в смс-шаблоне вместо фразы "в оговоренном месте" (п.2).
-- Безопасно перезапускаемая миграция.

-- ==========================================================================
-- ЖИВЫЕ ОБНОВЛЕНИЯ (п.5) — публикуем таблицы в supabase_realtime, чтобы
-- мобильное и веб-приложение подписывались на изменения вместо опроса раз
-- в минуту. RLS на этих таблицах уже есть (0013 и позже) — Realtime
-- учитывает её при доставке, отдельных политик под это не нужно.
-- order_crew — подтверждения («принял» заказ, доработки 3); driver_reports
-- — подача/согласование/отказ отчёта; notifications — уже собственная
-- лента (0024). ADD TABLE падает с ошибкой, если таблица уже в публикации,
-- поэтому оборачиваем в проверку через pg_publication_tables.
-- ==========================================================================
do $$
declare
  t text;
begin
  foreach t in array array['orders', 'order_crew', 'driver_reports', 'notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ==========================================================================
-- УДАЛИТЬ ИЗ СПИСКА СОТРУДНИКОВ (п.4) — отдельно от увольнения
-- (account_status='suspended', 0022, оставляет строку видимой в «Команде» с
-- бейджем «Уволен»): ещё одна кнопка на уже уволенном — скрыть его из
-- списка совсем. Не физическое удаление, та же причина, что в 0021/0022:
-- на строку по-прежнему ссылаются его прошлые заказы, отчёты, зарплата.
-- ==========================================================================
alter table employees add column if not exists hidden_at timestamptz;

comment on column employees.hidden_at is
  'Скрыт из "Команды" (кнопка "Удалить из списка" на уже уволенном) — история (заказы/отчёты/зарплата) по-прежнему ссылается на строку, вход и так заблокирован увольнением. Не снимается из интерфейса — осознанно необратимое действие.';

alter table employees drop constraint if exists employees_hidden_only_if_suspended;
alter table employees add constraint employees_hidden_only_if_suspended
  check (hidden_at is null or account_status = 'suspended');

create index if not exists employees_company_visible_idx
  on employees (company_id) where hidden_at is null;

-- Тот же самозащитный триггер (0014 → 0017 → 0021 → 0022): админ не может
-- скрыть сам себя прямым PATCH, той же логикой, что уже защищает role и
-- account_status.
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
    if new.auth_user_id = auth.uid() and new.hidden_at is distinct from old.hidden_at then
      raise exception 'Нельзя скрыть самого себя — попросите другого администратора'
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
     or new.hidden_at is distinct from old.hidden_at
  then
    raise exception 'Недостаточно прав для изменения роли, прав или ставки'
      using errcode = '42501';
  end if;

  return new;
end;
$$ language plpgsql security invoker;

-- ==========================================================================
-- АДРЕС ПОГРУЗКИ В СМС (п.2) — переменная [Address] уже подставлялась
-- автоматически (mobile/src/lib/smsCompose.ts, веб — свой эквивалент), но
-- исходный текст шаблона "new_order" по умолчанию всё ещё содержал фразу
-- "в оговоренном месте" вместо неё. Правим только строки, где эта фраза
-- ещё дословно встречается — компании, уже отредактировавшие свой шаблон
-- по-своему, не трогаем.
-- ==========================================================================
update sms_templates
  set body = replace(body, 'в оговоренном месте', 'по адресу [Address]')
  where key = 'new_order' and body like '%в оговоренном месте%';

-- И в функции, которая заводит шаблоны по умолчанию новым компаниям (0013)
-- — чтобы новые компании сразу получали исправленный текст.
create or replace function seed_company_defaults() returns trigger as $$
begin
  insert into sms_templates (company_id, key, label, body) values
    (new.id, 'new_order', 'Новый заказ (клиенту)',
     '[Name], подтверждаю Ваш заказ [Day], [Date] в [Time] по адресу [Address].'),
    (new.id, 'reminder', 'Напоминание клиенту о заказе',
     'Напоминаю. У вас заказ [Day], [Date] на [Time]'),
    (new.id, 'completed', 'Заказ выполнен',
     '[Name], Ваш заказ выполнен! Стоимость всех работ составила [Cost]. Спасибо, что выбрали нас!'),
    (new.id, 'cancelled', 'Заказ отменён',
     'Ваш заказ на [Day], [Date] на [Time] отменён. Извините.')
  on conflict (company_id, key) do nothing;
  insert into reminder_rules (company_id, target, offset_minutes)
  values (new.id, 'crew_push', 30)
  on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
