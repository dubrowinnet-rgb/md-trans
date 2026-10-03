-- Атомарное создание заказа: сам заказ + точки маршрута + экипаж одним
-- вызовом. Если check_employee_availability() (миграция 0001) найдёт
-- пересечение по времени у кого-то из экипажа, вся функция откатывается —
-- заказ и точки маршрута не остаются "осиротевшими" в базе.
create or replace function create_order(
  p_client_id uuid,
  p_cargo_description text,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_actual_price numeric,
  p_comment text,
  p_stops jsonb, -- [{ type, address, order_index, is_primary }]
  p_crew jsonb   -- [{ employee_id, role }]
) returns uuid
language plpgsql
security invoker
as $$
declare
  new_order_id uuid;
begin
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

  return new_order_id;
end;
$$;

revoke execute on function create_order(uuid, text, timestamptz, timestamptz, numeric, text, jsonb, jsonb) from public;
grant execute on function create_order(uuid, text, timestamptz, timestamptz, numeric, text, jsonb, jsonb) to authenticated;
