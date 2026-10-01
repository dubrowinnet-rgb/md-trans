-- Подробные уведомления об изменении заказа (Максим, 01.10, «Правки 5»,
-- п.3): «Что именно изменилось должно подсвечиваться (время, состав
-- сотрудников, сумма, адреса и тд), а также в ленте уведомлений это должно
-- быть коротко прописано». Экран ленты (settings/notifications.tsx) и сама
-- лента показывают один и тот же текст body (до 3 строк) — поэтому короткий
-- заголовок + построчный список «было → стало» закрывают оба требования
-- одним текстом, без отдельного экрана деталей.
--
-- ВАЖНО: это только notifications.body (своя база, читает только сам
-- сотрудник). Текст самого push (notify-order-changed/index.ts) НЕ трогаем
-- и НЕ усложняем — он намеренно общий, без адресов/сумм/имён, потому что
-- идёт через Expo/Apple/Google за пределами РФ (152-ФЗ, см. комментарии в
-- 0015/0019/0024). Подробности сотрудник видит только открыв ленту/заказ
-- в приложении на своём сервере.
--
-- Файл можно выполнить повторно.

-- ==========================================================================
-- 1. Заказ изменён — та же триггерная функция orders_notify_changed
--    (0015/0018/0024), теперь строит список изменённых полей вместо общей
--    фразы «обновлена информация».
-- ==========================================================================
create or replace function notify_order_changed() returns trigger as $$
declare
  v_cancelled boolean;
  v_title text;
  v_body text;
  v_labels text[] := '{}';
  v_details text[] := '{}';
begin
  v_cancelled := (new.status = 'cancelled' and old.status is distinct from 'cancelled');

  if v_cancelled then
    v_title := 'Заказ отменён';
    v_body := 'Заказ на ' || to_char(new.scheduled_start at time zone 'Europe/Moscow', 'DD.MM')
      || ' в ' || to_char(new.scheduled_start at time zone 'Europe/Moscow', 'HH24:MI') || ' отменён';
  else
    -- || между text[] и голым строковым литералом в plpgsql неоднозначен —
    -- Postgres пытается разобрать правую часть как текст МАССИВА (а не
    -- добавить элементом) и падает на «malformed array literal» на любом
    -- слове без {} — поймано локальным тестом на scratch-базе. array_append
    -- этой неоднозначности не имеет.
    if old.scheduled_start is distinct from new.scheduled_start or old.scheduled_end is distinct from new.scheduled_end then
      v_labels := array_append(v_labels, 'время');
      v_details := array_append(v_details,
        'Время: ' || to_char(old.scheduled_start at time zone 'Europe/Moscow', 'HH24:MI') || '–'
        || to_char(old.scheduled_end at time zone 'Europe/Moscow', 'HH24:MI') || ' → '
        || to_char(new.scheduled_start at time zone 'Europe/Moscow', 'HH24:MI') || '–'
        || to_char(new.scheduled_end at time zone 'Europe/Moscow', 'HH24:MI')
      );
    end if;
    if old.actual_price is distinct from new.actual_price then
      v_labels := array_append(v_labels, 'сумма');
      v_details := array_append(v_details,
        'Сумма: ' || regexp_replace(coalesce(old.actual_price::text, '—'), '\.00$', '')
        || ' → ' || regexp_replace(coalesce(new.actual_price::text, '—'), '\.00$', '') || ' ₽'
      );
    end if;
    if old.vehicle_id is distinct from new.vehicle_id then
      v_labels := array_append(v_labels, 'машина');
      v_details := array_append(v_details, 'Машина изменена');
    end if;
    if old.client_id is distinct from new.client_id then
      v_labels := array_append(v_labels, 'клиент');
      v_details := array_append(v_details, 'Клиент изменён');
    end if;
    if old.cargo_description is distinct from new.cargo_description then
      v_labels := array_append(v_labels, 'груз');
      v_details := array_append(v_details, 'Груз изменён');
    end if;
    if old.comment is distinct from new.comment then
      v_labels := array_append(v_labels, 'комментарий');
      v_details := array_append(v_details, 'Комментарий изменён');
    end if;

    if array_length(v_labels, 1) > 0 then
      v_title := 'Изменено: ' || array_to_string(v_labels, ', ');
      v_body := array_to_string(v_details, E'\n');
    else
      v_title := 'Изменения в заказе';
      v_body := 'Заказ на ' || to_char(new.scheduled_start at time zone 'Europe/Moscow', 'DD.MM') || ': обновлена информация';
    end if;
  end if;

  insert into notifications (company_id, employee_id, kind, title, body, order_id)
  select new.company_id, oc.employee_id, case when v_cancelled then 'order_cancelled' else 'order_changed' end, v_title, v_body, new.id
  from order_crew oc
  where oc.order_id = new.id;

  perform private.call_edge_function(
    'notify-order-changed',
    jsonb_build_object('order_id', new.id, 'cancelled', v_cancelled)
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ==========================================================================
-- 2. Состав бригады изменён — уведомляем ОСТАЛЬНЫХ участников (сам новый/
--    выбывший получает своё личное уведомление отдельно: «Новый заказ» на
--    INSERT уже шлёт 0027; на DELETE личного уведомления нет и не нужно —
--    человек, которого сняли с заказа, и так это заметит). Без push: это
--    не самостоятельное событие 152-ФЗ ради, а дополнение к тому, что уже
--    послал 0027 при назначении — второй push на то же самое было бы лишним.
-- ==========================================================================
create or replace function notify_crew_composition_changed() returns trigger as $$
declare
  v_order_id uuid;
  v_changed_employee_id uuid;
  v_employee_name text;
  v_company_id uuid;
  v_scheduled_start timestamptz;
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_order_id := new.order_id;
    v_changed_employee_id := new.employee_id;
    v_action := 'добавлен(а) в бригаду';
  else
    v_order_id := old.order_id;
    v_changed_employee_id := old.employee_id;
    v_action := 'выведен(а) из бригады';
  end if;

  select company_id, scheduled_start into v_company_id, v_scheduled_start from orders where id = v_order_id;
  -- Заказ мог быть уже удалён в этой же транзакции (каскад) — тогда выходим.
  if v_company_id is null then
    return coalesce(new, old);
  end if;

  select name into v_employee_name from employees where id = v_changed_employee_id;

  insert into notifications (company_id, employee_id, kind, title, body, order_id)
  select v_company_id, oc.employee_id, 'order_changed', 'Изменено: состав бригады',
    'Заказ на ' || to_char(v_scheduled_start at time zone 'Europe/Moscow', 'DD.MM') || E'\n'
      || coalesce(v_employee_name, 'Сотрудник') || ' ' || v_action,
    v_order_id
  from order_crew oc
  where oc.order_id = v_order_id and oc.employee_id <> v_changed_employee_id;

  return coalesce(new, old);
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists order_crew_notify_composition_insert on order_crew;
create trigger order_crew_notify_composition_insert
  after insert on order_crew
  for each row
  execute function notify_crew_composition_changed();

drop trigger if exists order_crew_notify_composition_delete on order_crew;
create trigger order_crew_notify_composition_delete
  after delete on order_crew
  for each row
  execute function notify_crew_composition_changed();

-- ==========================================================================
-- 3. Адрес изменён — сейчас адреса не редактируются ни из мобильного
--    приложения, ни (насколько известно) из веб-кабинета, но триггер в базе
--    должен работать одинаково для любого клиента, который когда-либо это
--    сделает (тот же принцип, что в 0015) — на будущее, без push.
-- ==========================================================================
create or replace function notify_order_stop_changed() returns trigger as $$
declare
  v_company_id uuid;
  v_scheduled_start timestamptz;
  v_label text;
begin
  select company_id, scheduled_start into v_company_id, v_scheduled_start from orders where id = new.order_id;
  if v_company_id is null then
    return new;
  end if;
  v_label := case when new.type = 'pickup' then 'Адрес загрузки' else 'Адрес выгрузки' end;

  insert into notifications (company_id, employee_id, kind, title, body, order_id)
  select v_company_id, oc.employee_id, 'order_changed', 'Изменено: адрес',
    'Заказ на ' || to_char(v_scheduled_start at time zone 'Europe/Moscow', 'DD.MM') || E'\n'
      || v_label || ': ' || old.address || ' → ' || new.address,
    new.order_id
  from order_crew oc
  where oc.order_id = new.order_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists order_stops_notify_changed on order_stops;
create trigger order_stops_notify_changed
  after update on order_stops
  for each row
  when (old.address is distinct from new.address and new.is_primary)
  execute function notify_order_stop_changed();
