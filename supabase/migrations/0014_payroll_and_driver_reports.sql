-- Зарплата по часам + отчёты водителей (запрос в проекте, 2026-09-25).
-- Ставки задаёт администратор, сотрудник только видит калькуляцию у себя.
-- Отчёт водителя — полуавтоматически по заказам дня, касса, расходы,
-- топливо, фото одометра, подтверждение администратором фиксирует его в
-- финансовых отчётах. Имена таблиц/полей сверены заранее с веткой
-- веб-кабинета (`claude/project-thread-8z4luq`, `web/src/api/payroll.ts` и
-- `driverReports.ts`), чтобы не потребовалась переделка.
--
-- Дубль-роль (водитель, который на этом же заказе ещё и грузчик,
-- `order_crew` с 0007 допускает две строки) — Максим выбрал явно (карточка
-- решения, 2026-09-25): часы заказа считаются ОДИН раз, по БОЛЬШЕЙ из двух
-- ставок, а не по обеим. Реализовано в useEmployeePayEstimate на мобильной
-- стороне (mobile/src/api/payroll.ts) и независимо тем же образом на
-- веб-кабинете (web/src/api/payroll.ts, коммит 4445e42, память проекта
-- payroll-and-driver-reports-feature) — оба группируют order_crew по
-- order_id перед подсчётом, ни один не суммирует ставки.

-- ==========================================================================
-- Ставки — на employees, не отдельной таблицей: у сотрудника одна текущая
-- ставка, истории изменений не просили.
-- ==========================================================================
alter table employees add column hourly_rate numeric(10, 2);
alter table employees add column driving_hourly_rate numeric(10, 2);
alter table employees add column loading_hourly_rate numeric(10, 2);
alter table employees add column rate_mode text not null default 'combined'
  check (rate_mode in ('combined', 'split'));

-- Расширяем уже существующий триггер (0013) вместо нового — не даёт
-- не-администратору сменить себе роль/компанию, теперь и ставку/режим
-- ставки тоже: иначе сотрудник мог бы сам себе задать зарплату прямым
-- PATCH к employees (RLS до этой миграции такую правку не отличала от
-- любой другой самообслуживания, вроде смены push-токена).
--
-- Заодно чиним найденный при тестировании этой миграции баг самой 0013
-- (в проде ещё не применена, править на месте безопасно): триггеры, в
-- отличие от RLS-политик, не обходятся ролью с BYPASSRLS — обычный
-- SQL Editor / миграция от имени postgres тоже через него проходят, а там
-- auth.uid() всегда NULL (нет JWT), is_admin() из-за этого всегда false, и
-- бутстрап-запрос «Сделать себя администратором» (README) падал бы с этой
-- же ошибкой. Правило теперь действует только когда есть настоящий
-- аутентифицированный вызывающий (auth.uid() не null) — то есть ровно
-- тогда, когда есть кого-то от кого защищать самоэскалацию; вне такого
-- контекста (SQL Editor, service role, сама эта миграция) ограничение не
-- применяется, как и везде в проекте.
create or replace function restrict_employee_self_role_change() returns trigger as $$
begin
  if auth.uid() is not null and not is_admin() and (
    new.role is distinct from old.role
    or new.company_id is distinct from old.company_id
    or new.hourly_rate is distinct from old.hourly_rate
    or new.driving_hourly_rate is distinct from old.driving_hourly_rate
    or new.loading_hourly_rate is distinct from old.loading_hourly_rate
    or new.rate_mode is distinct from old.rate_mode
  ) then
    raise exception 'Недостаточно прав для изменения роли, компании или ставки' using errcode = '42501';
  end if;
  return new;
end;
$$ language plpgsql security invoker;

-- ==========================================================================
-- driver_reports — один отчёт на сотрудника на день. company_id — сразу
-- (таблица новая, тенантность уже есть, задним числом сводить не нужно).
-- ==========================================================================
create table driver_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) default get_my_company_id(),
  employee_id uuid not null references employees (id),
  report_date date not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'confirmed')),
  cash_handed_in numeric(10, 2),
  confirmed_by uuid references employees (id),
  confirmed_at timestamptz,
  fuel_amount numeric(10, 2),
  fuel_payment_method text check (fuel_payment_method in ('cash', 'cashless')),
  odometer_photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, report_date)
);

create index driver_reports_company_id_idx on driver_reports (company_id);
create index driver_reports_employee_id_idx on driver_reports (employee_id);

create trigger driver_reports_set_updated_at
  before update on driver_reports
  for each row
  execute function set_updated_at();

alter table driver_reports enable row level security;

-- select: сам сотрудник — только свои; администратор — все отчёты своей
-- компании (включая ещё не отправленные — так же, как уже показывает
-- веб-кабинет, статус не фильтруется).
create policy "driver_reports select" on driver_reports for select to authenticated
  using (
    employee_id = (select id from employees where auth_user_id = auth.uid())
    or (is_admin() and company_id = get_my_company_id())
  );

-- insert: только свой отчёт, только в свою компанию, и не сразу
-- «подтверждённым» — confirmed выставляет только сам администратор через
-- отдельное обновление (ниже).
create policy "driver_reports insert" on driver_reports for insert to authenticated
  with check (
    employee_id = (select id from employees where auth_user_id = auth.uid())
    and company_id = get_my_company_id()
    and status in ('draft', 'submitted')
    and confirmed_by is null
    and confirmed_at is null
  );

-- update — двумя политиками (permissive, работают через ИЛИ):
-- сам сотрудник может править, пока отчёт не подтверждён, но не может сам
-- себе поставить confirmed/confirmed_by/confirmed_at; администратор может
-- всё в своей компании (это и есть подтверждение).
create policy "driver_reports update self" on driver_reports for update to authenticated
  using (
    employee_id = (select id from employees where auth_user_id = auth.uid())
    and status <> 'confirmed'
  )
  with check (
    employee_id = (select id from employees where auth_user_id = auth.uid())
    and status <> 'confirmed'
    and confirmed_by is null
    and confirmed_at is null
  );
create policy "driver_reports update admin" on driver_reports for update to authenticated
  using (is_admin() and company_id = get_my_company_id())
  with check (is_admin() and company_id = get_my_company_id());

-- delete — только свой черновик (ещё не отправленный).
create policy "driver_reports delete" on driver_reports for delete to authenticated
  using (
    employee_id = (select id from employees where auth_user_id = auth.uid())
    and status = 'draft'
  );

-- ==========================================================================
-- driver_report_orders / driver_report_expenses — дочерние от
-- driver_reports, своего company_id нет, доступ через родителя. Писать
-- может только владелец отчёта, и только пока он не подтверждён —
-- администратор подтверждает сам отчёт, а не правит его строки.
-- ==========================================================================
create table driver_report_orders (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references driver_reports (id) on delete cascade,
  order_id uuid not null references orders (id),
  paid_by_transfer boolean not null default false,
  unique (report_id, order_id)
);

create index driver_report_orders_report_id_idx on driver_report_orders (report_id);

alter table driver_report_orders enable row level security;

create policy "driver_report_orders select" on driver_report_orders for select to authenticated
  using (exists (
    select 1 from driver_reports r
    where r.id = driver_report_orders.report_id
      and (
        r.employee_id = (select id from employees where auth_user_id = auth.uid())
        or (is_admin() and r.company_id = get_my_company_id())
      )
  ));
create policy "driver_report_orders write" on driver_report_orders for all to authenticated
  using (exists (
    select 1 from driver_reports r
    where r.id = driver_report_orders.report_id
      and r.employee_id = (select id from employees where auth_user_id = auth.uid())
      and r.status <> 'confirmed'
  ))
  with check (exists (
    select 1 from driver_reports r
    where r.id = driver_report_orders.report_id
      and r.employee_id = (select id from employees where auth_user_id = auth.uid())
      and r.status <> 'confirmed'
  ));

create table driver_report_expenses (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references driver_reports (id) on delete cascade,
  description text not null,
  amount numeric(10, 2) not null
);

create index driver_report_expenses_report_id_idx on driver_report_expenses (report_id);

alter table driver_report_expenses enable row level security;

create policy "driver_report_expenses select" on driver_report_expenses for select to authenticated
  using (exists (
    select 1 from driver_reports r
    where r.id = driver_report_expenses.report_id
      and (
        r.employee_id = (select id from employees where auth_user_id = auth.uid())
        or (is_admin() and r.company_id = get_my_company_id())
      )
  ));
create policy "driver_report_expenses write" on driver_report_expenses for all to authenticated
  using (exists (
    select 1 from driver_reports r
    where r.id = driver_report_expenses.report_id
      and r.employee_id = (select id from employees where auth_user_id = auth.uid())
      and r.status <> 'confirmed'
  ))
  with check (exists (
    select 1 from driver_reports r
    where r.id = driver_report_expenses.report_id
      and r.employee_id = (select id from employees where auth_user_id = auth.uid())
      and r.status <> 'confirmed'
  ));

-- ==========================================================================
-- Бакет для фото одометра. Публичный на чтение (как уже показывает
-- веб-кабинет — простая ссылка `<a href>`, без подписанных URL) — снимок
-- одометра не персональные данные и не финансовая информация; путь файла
-- случайный (не перечислим угадыванием). Заливать может любой вошедший
-- (это всегда сам водитель, свой же отчёт) — какой именно отчёт получит
-- ссылку, отдельно проверяет RLS таблицы driver_reports.
-- ==========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('odometer-photos', 'odometer-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "odometer photos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'odometer-photos');
create policy "odometer photos select" on storage.objects for select to public
  using (bucket_id = 'odometer-photos');

-- ==========================================================================
-- Планировщик напоминания водителю в 21:00 по Москве (= 18:00 UTC,
-- Москва круглый год без перехода на летнее время) — та же схема, что
-- send-crew-reminders в 0011. Если pg_cron/pg_net выключены на проекте —
-- включите в Dashboard → Database → Extensions и выполните файл ещё раз.
-- ==========================================================================
create extension if not exists pg_cron;

select cron.schedule(
  'remind-driver-report',
  '0 18 * * *',
  $$
  select net.http_post(
    url := 'https://mjrbqnsvwohmwvapiikr.supabase.co/functions/v1/remind-driver-report',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
