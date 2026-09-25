-- Необязательный пример данных для ручной проверки календаря/создания заказа.
-- Выполните в SQL Editor после всех миграций (нужна таблица companies,
-- миграция 0013) — добавит сотрудников/клиентов в первую по дате создания
-- компанию.

insert into employees (role, name, phone, company_id) values
  ('driver', 'Максим Дубровин', '+79250000001', (select id from companies order by created_at limit 1)),
  ('driver', 'Сергей Стаханов', '+79250000002', (select id from companies order by created_at limit 1)),
  ('loader', 'Иван Петров', '+79250000003', (select id from companies order by created_at limit 1)),
  ('loader', 'Николай Сидоров', '+79250000004', (select id from companies order by created_at limit 1));

insert into clients (name, phone, discount_percent, company_id) values
  ('Нина АвиаПром', '+79250000010', 0, (select id from companies order by created_at limit 1)),
  ('Дмитрий Хлопотов', '+79250000011', 5, (select id from companies order by created_at limit 1));
