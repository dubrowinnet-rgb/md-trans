-- ==========================================================================
-- company_settings.working_hours_{start,end} — рабочее время компании по
-- умолчанию (Максим, 30.09, «Правки мобильного приложения 3», п.1): красит
-- сетку календаря (рабочие часы белым, нерабочее — серым, как уже сделано
-- для прошедшего времени) и задаёт точку, откуда открывается сетка на
-- 3/7-дневном виде (PagedCalendar, см. мобильный код).
--
-- Отдельная таблица, а не колонки в companies — та целиком под RLS
-- владельца сервиса (подписка, саппорт, доработки 2026-09-25), обычная
-- бытовая настройка туда не подходит. По образцу reminder_rules/services:
-- одна строка на компанию, читают все сотрудники компании (нужно для
-- календаря всем ролям), меняет только админ своей же компании.
-- ==========================================================================
create table if not exists company_settings (
  company_id uuid primary key references companies (id) on delete cascade default get_my_company_id(),
  working_hours_start time not null default '08:00',
  working_hours_end time not null default '21:00',
  updated_at timestamptz not null default now()
);

alter table company_settings enable row level security;

create policy "company_settings select" on company_settings for select to authenticated
  using (company_id = (select get_my_company_id()));
create policy "company_settings write by admin" on company_settings for all to authenticated
  using ((select is_admin()) and company_id = (select get_my_company_id()))
  with check ((select is_admin()) and company_id = (select get_my_company_id()));

create trigger company_settings_set_updated_at
  before update on company_settings
  for each row
  execute function set_updated_at();

-- Дефолтная строка для уже существующих компаний (8:00–21:00, значение,
-- которое Максим прямо назвал). Новые компании получают её лениво — см.
-- mobile/src/api/companySettings.ts (maybeSingle + дефолт в коде, без
-- зависимости от момента создания компании).
insert into company_settings (company_id)
select id from companies
on conflict (company_id) do nothing;
