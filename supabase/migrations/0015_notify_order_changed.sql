-- Доработки 2, п.3 (запрос в проекте, 2026-09-25): при любом изменении
-- заказа (время, сумма, груз, комментарий, статус/отмена, машина, клиент)
-- или его отмене — пуш всем назначенным исполнителям. Как и уведомление
-- владельцу о тикете (миграция 0013), это триггер в базе через pg_net, а
-- не код в конкретном приложении: заказ можно отредактировать и с
-- телефона, и из веб-кабинета, и в обоих случаях исполнители должны
-- получить пуш одинаково. pg_net уже включён миграцией 0011/0013.
--
-- Что НЕ входит в это уведомление (уже покрыто отдельно, до этой
-- миграции): назначение НОВОГО участника бригады — свой пуш
-- «Изменение экипажа» шлёт useUpdateOrderCrew на клиенте сразу при
-- добавлении; создание заказа — свой пуш «Новый заказ» шлёт
-- useCreateOrder. Эта миграция — только про изменение уже
-- существующего заказа как такового (сам триггер — AFTER UPDATE, на
-- INSERT не срабатывает). Машину задаёт то же useUpdateOrderCrew при
-- смене бригады — если саму машину при этом не поменяли, значение не
-- отличается от старого и это уведомление лишний раз не сработает.
--
-- Получают уведомление ВСЕ, кто сейчас в бригаде заказа, без
-- исключения того, кто сам внёс изменение (упростили сознательно —
-- лишний пуш себе самому не мешает, а вычислять автора внутри триггера
-- по auth.uid() усложнило бы код без ощутимой пользы).

create or replace function notify_order_changed() returns trigger as $$
begin
  perform net.http_post(
    url := 'https://mjrbqnsvwohmwvapiikr.supabase.co/functions/v1/notify-order-changed',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'order_id', new.id,
      'cancelled', (new.status = 'cancelled' and old.status is distinct from 'cancelled')
    )
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger orders_notify_changed
  after update on orders
  for each row
  when (
    old.scheduled_start is distinct from new.scheduled_start
    or old.scheduled_end is distinct from new.scheduled_end
    or old.actual_price is distinct from new.actual_price
    or old.cargo_description is distinct from new.cargo_description
    or old.comment is distinct from new.comment
    or old.status is distinct from new.status
    or old.vehicle_id is distinct from new.vehicle_id
    or old.client_id is distinct from new.client_id
  )
  execute function notify_order_changed();
