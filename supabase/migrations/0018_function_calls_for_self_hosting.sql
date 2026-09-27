-- Переезд на собственный сервер в России (152-ФЗ, запрос 2026-09-27).
--
-- База сама вызывает четыре Edge Function: напоминания по расписанию
-- (pg_cron: send-crew-reminders из 0011, remind-driver-report из 0014) и
-- пуши по триггерам (notify-owner-new-ticket из 0013, notify-order-changed
-- из 0015). До этой миграции адрес функций был зашит прямо в тех файлах —
-- облачный https://mjrbqnsvwohmwvapiikr.supabase.co. На своём сервере
-- функции живут по другому адресу (внутри Docker-сети, http://functions:9000),
-- поэтому адрес теперь — одна настройка в private.app_settings, а все четыре
-- вызова идут через одну функцию private.call_edge_function.
--
-- Значение по умолчанию — прежний облачный адрес: если выполнить эту
-- миграцию в облачном проекте, там ничего не изменится. Установщик своего
-- сервера (deploy/selfhost) после миграций сам меняет настройку на
-- внутренний адрес.
--
-- Заодно: сбой при постановке вызова в очередь больше не откатывает саму
-- правку заказа или создание обращения — уведомление не должно ломать
-- основную запись. И ответа функции pg_net теперь ждёт до минуты (раньше
-- 5 секунд по умолчанию — send-crew-reminders при большом числе заказов
-- могла не уложиться).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Схема не видна через API (PostgREST отдаёт только public), права на неё
-- есть только у владельца — таблицу и функцию ниже не прочитать и не вызвать
-- из приложения.
create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.app_settings (
  key text primary key,
  value text not null
);
alter table private.app_settings enable row level security;
revoke all on private.app_settings from public;

insert into private.app_settings (key, value)
values ('functions_base_url', 'https://mjrbqnsvwohmwvapiikr.supabase.co/functions/v1')
on conflict (key) do nothing;

create or replace function private.call_edge_function(fn text, payload jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
begin
  select value into base_url from private.app_settings where key = 'functions_base_url';
  if coalesce(base_url, '') = '' then
    return;
  end if;
  perform net.http_post(
    url := rtrim(base_url, '/') || '/' || fn,
    body := payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 60000
  );
exception when others then
  raise warning 'call_edge_function(%): %', fn, sqlerrm;
end;
$$;

revoke all on function private.call_edge_function(text, jsonb) from public;

-- Те же триггерные функции, что в 0013 и 0015, — меняется только способ
-- вызова (тело запроса прежнее).
create or replace function notify_owner_new_ticket() returns trigger as $$
begin
  perform private.call_edge_function('notify-owner-new-ticket', jsonb_build_object('ticket_id', new.id));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function notify_order_changed() returns trigger as $$
begin
  perform private.call_edge_function(
    'notify-order-changed',
    jsonb_build_object(
      'order_id', new.id,
      'cancelled', (new.status = 'cancelled' and old.status is distinct from 'cancelled')
    )
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- cron.schedule с уже существующим именем задания обновляет его, а не
-- создаёт второе — расписание прежнее, меняется только команда.
select cron.schedule(
  'send-crew-reminders',
  '*/5 * * * *',
  $$select private.call_edge_function('send-crew-reminders')$$
);

select cron.schedule(
  'remind-driver-report',
  '0 18 * * *',
  $$select private.call_edge_function('remind-driver-report')$$
);
