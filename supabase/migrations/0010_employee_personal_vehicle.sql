-- Личный транспорт сотрудника (раздел «баги 3», п.6) — отдельно от
-- автопарка компании (таблица vehicles): просто справочные марка и гос
-- номер, без грузоподъёмности и прочих полей автопарка.

alter table employees add column if not exists personal_vehicle_make text;
alter table employees add column if not exists personal_vehicle_plate text;
