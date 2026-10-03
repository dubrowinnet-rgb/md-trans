-- Раздел «Настройки» (доработки 1, п.0/1/2): шаблоны смс клиентам,
-- правила пуш-напоминаний сотрудникам о заказе и журнал уже отправленных
-- напоминаний (чтобы не слать одно и то же дважды). «Оплата профиля» из
-- п.2 отдельной таблицы не требует — это уже существующие
-- employees.paid_until/account_status/monthly_price (миграция 0001),
-- просто не было экрана, который их показывает.

-- ==========================================================================
-- services — до этой миграции была общая «authenticated full access»
-- (0001), то есть писать мог любой вошедший. Доработки 1, п.2 отдаёт
-- «добавлять/изменять услуги» администратору — сужаем запись, чтение
-- остаётся всем (нужно для формы заказа всем ролям с can_manage_orders).
-- ==========================================================================
drop policy if exists "authenticated full access" on services;
create policy "services select" on services for select to authenticated using (true);
create policy "services write by admin" on services for all to authenticated
  using (is_admin()) with check (is_admin());

-- ==========================================================================
-- sms_templates — тексты смс клиентам, редактируются администратором в
-- Настройках (и на мобильном, и в веб-кабинете — веб-часть копирует эту
-- миграцию). [Name]/[Day]/[Date]/[Time]/[Cost]/[Address] подставляются
-- автоматически при отправке (см. supabase/functions/send-order-sms).
-- Пока автоматически отправляется только new_order (доработки 1, п.0);
-- остальные три — задел под будущие рассылки (напоминание клиенту о
-- заказе, «заказ выполнен», «заказ отменён), текст уже можно готовить и
-- менять заранее.
-- ==========================================================================
create table if not exists sms_templates (
  key text primary key,
  label text not null,
  body text not null,
  updated_at timestamptz not null default now()
);

alter table sms_templates enable row level security;
create policy "sms_templates select" on sms_templates for select to authenticated using (true);
create policy "sms_templates update by admin" on sms_templates for update to authenticated
  using (is_admin()) with check (is_admin());

insert into sms_templates (key, label, body) values
  ('new_order', 'Новый заказ (клиенту)',
   '[Name], подтверждаю Ваш заказ [Day], [Date] в [Time] в оговоренном месте. Максим Дубровин, мувинговая компания «МАКС Доставка»'),
  ('reminder', 'Напоминание клиенту о заказе',
   'Напоминаю. У вас заказ [Day], [Date] на [Time]'),
  ('completed', 'Заказ выполнен',
   '[Name], Ваш заказ выполнен! Стоимость всех работ составила [Cost]. Пожалуйста, напишите нам, что мы могли бы сделать лучше — спасибо, что выбрали «МАКС Доставка»!'),
  ('cancelled', 'Заказ отменён',
   'Ваш заказ на [Day], [Date] на [Time] отменён. Извините.')
on conflict (key) do nothing;

create trigger sms_templates_set_updated_at
  before update on sms_templates
  for each row
  execute function set_updated_at();

-- Уже отправляли смс клиенту по этому заказу? Не слать повторно, если
-- дёрнут ещё раз (например, диспетчер зашёл в заказ повторно).
alter table orders add column if not exists client_sms_sent_at timestamptz;

-- ==========================================================================
-- reminder_rules — «за сколько минут напомнить» (доработки 1, п.1 —
-- пуш-напоминание сотруднику о предстоящем заказе). Список редактируется
-- в Настройках; можно несколько правил (как в референсе — «Напомнить мне,
-- за 30 мин.» и т.д.). target пока только 'crew_push' — задел под
-- будущие каналы (например, смс клиенту-напоминание из sms_templates.reminder).
-- ==========================================================================
create table if not exists reminder_rules (
  id uuid primary key default gen_random_uuid(),
  target text not null default 'crew_push' check (target in ('crew_push')),
  offset_minutes integer not null check (offset_minutes > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table reminder_rules enable row level security;
create policy "reminder_rules select" on reminder_rules for select to authenticated using (true);
create policy "reminder_rules write by admin" on reminder_rules for all to authenticated
  using (is_admin()) with check (is_admin());

insert into reminder_rules (target, offset_minutes)
select 'crew_push', 30
where not exists (select 1 from reminder_rules);

-- Журнал отправленных напоминаний — служебная таблица, пишет и читает
-- только Edge Function (service role, обходит RLS), поэтому политик для
-- authenticated нарочно нет: RLS включён и по умолчанию всё запрещает.
create table if not exists order_reminder_log (
  order_id uuid not null references orders (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  rule_id uuid not null references reminder_rules (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (order_id, employee_id, rule_id)
);

alter table order_reminder_log enable row level security;

-- ==========================================================================
-- Планировщик пуш-напоминаний — раз в 5 минут дёргает Edge Function
-- send-crew-reminders (сама функция проверяет reminder_rules и
-- order_reminder_log и решает, кому пора напомнить). Если на вашем
-- проекте расширения pg_cron/pg_net выключены — Dashboard → Database →
-- Extensions → включите оба, затем выполните этот файл ещё раз.
-- ==========================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-crew-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://mjrbqnsvwohmwvapiikr.supabase.co/functions/v1/send-crew-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
