-- Профиль сотрудника (раздел «Команда» — админ должен видеть и менять
-- логин/пароль и полную информацию о сотруднике): фамилия, дата рождения,
-- начало работы в компании, адрес проживания. Возраст не хранится —
-- считается на экране из даты рождения.

alter table employees add column if not exists last_name text;
alter table employees add column if not exists birth_date date;
alter table employees add column if not exists hire_date date;
alter table employees add column if not exists address text;
