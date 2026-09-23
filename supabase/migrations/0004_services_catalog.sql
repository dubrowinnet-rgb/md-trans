-- Каталог услуг с цветами (как в Bumpix: цвет заказа в календаре = цвет
-- его услуги) и услуги в create_order. Выполнить в SQL Editor после 0001–0003.

alter table services add column if not exists color text not null default '#8E24AA';

-- Стартовый каталог со скриншотов референса. Длительность и цену можно
-- поменять прямо в таблице services. Повторный запуск не создаёт дублей.
insert into services (name, base_duration_minutes, base_price, color)
select v.name, v.duration, v.price, v.color
from (values
  ('Газель по городу',              60,  3500, '#1E88E5'),
  ('Газель межгород',              120,     0, '#00969B'),
  ('Газель + грузчик',             120,  6000, '#6A00F4'),
  ('Газель + 2 грузчика по городу', 120,  9000, '#3DCC3D'),
  ('Газель + 3 грузчика',          120, 11600, '#1B9E3E'),
  ('Газель + 4 грузчика по городу',  60,  7000, '#F4411E'),
  ('Газель + 2 грузчика межгород', 180,     0, '#D500F9'),
  ('Услуги грузчиков',             120,  5000, '#FF6D00'),
  ('Утилизация мебели',             60,  9000, '#9E9E9E'),
  ('Демонтажные работы',           180,     0, '#6A1B4D'),
  ('Вывоз строительного мусора',    60, 15000, '#A0A0A0'),
  ('Сборка мебели',                 60,  5000, '#D4A017')
) as v(name, duration, price, color)
where not exists (select 1 from services s where s.name = v.name);

-- create_order получает список услуг. Старую версию (без p_services)
-- удаляем, чтобы у RPC была одна сигнатура.
drop function if exists create_order(uuid, text, timestamptz, timestamptz, numeric, text, jsonb, jsonb);

create or replace function create_order(
  p_client_id uuid,
  p_cargo_description text,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_actual_price numeric,
  p_comment text,
  p_stops jsonb,                       -- [{ type, address, order_index, is_primary }]
  p_crew jsonb,                        -- [{ employee_id, role }]
  p_services jsonb default '[]'::jsonb -- [{ service_id, qty }]
) returns uuid
language plpgsql
security invoker
as $$
declare
  new_order_id uuid;
begin
  if p_client_id is null then
    raise exception 'Заказ без клиента создать нельзя';
  end if;

  insert into orders (client_id, cargo_description, scheduled_start, scheduled_end, actual_price, comment)
  values (p_client_id, p_cargo_description, p_scheduled_start, p_scheduled_end, p_actual_price, p_comment)
  returning id into new_order_id;

  insert into order_stops (order_id, type, address, order_index, is_primary)
  select
    new_order_id,
    (s->>'type')::text,
    s->>'address',
    coalesce((s->>'order_index')::int, 0),
    coalesce((s->>'is_primary')::boolean, false)
  from jsonb_array_elements(p_stops) s;

  insert into order_crew (order_id, employee_id, role, status, notified_at)
  select
    new_order_id,
    (c->>'employee_id')::uuid,
    (c->>'role')::text,
    'notified',
    now()
  from jsonb_array_elements(p_crew) c;

  insert into order_services (order_id, service_id, qty)
  select
    new_order_id,
    (x->>'service_id')::uuid,
    coalesce((x->>'qty')::int, 1)
  from jsonb_array_elements(p_services) x;

  return new_order_id;
end;
$$;

revoke execute on function create_order(uuid, text, timestamptz, timestamptz, numeric, text, jsonb, jsonb, jsonb) from public;
grant execute on function create_order(uuid, text, timestamptz, timestamptz, numeric, text, jsonb, jsonb, jsonb) to authenticated;
