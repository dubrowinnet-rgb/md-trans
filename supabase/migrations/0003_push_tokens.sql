-- Push-токен устройства сотрудника (раздел 9.5 — уведомление о новом
-- заказе). Одно устройство на сотрудника — этого достаточно для MVP.
alter table employees add column expo_push_token text;
