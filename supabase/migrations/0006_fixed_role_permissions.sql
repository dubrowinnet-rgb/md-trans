-- Уточнение прав по ролям (обсуждение в проекте, 2026-09-23): галочки
-- can_manage_orders/can_view_client_stats/can_view_contacts_and_amounts
-- остаются (администратор по-прежнему может донастроить конкретный
-- аккаунт), но теперь это надстройка поверх нового поведения по
-- умолчанию для водителя и грузчика:
--   водитель без can_manage_orders — редактирует только время и сумму
--     заказа, остальное только смотрит; с can_manage_orders — как диспетчер;
--   грузчик — всегда только просмотр (can_manage_orders для него в UI не
--     предлагается, но если админ всё же включит — получает полный доступ,
--     как раньше). Сумму заказа грузчик не видит никогда. Телефон клиента
--     видит, если в бригаде заказа нет водителя, либо если админ явно
--     включил can_view_contacts_and_amounts.
-- can_view_contacts_and_amounts и can_view_client_stats не меняют
-- смысл для администратора/диспетчера/водителя — как и раньше.

create or replace function is_driver() returns boolean
language sql stable security invoker as $$
  select exists (
    select 1 from employees where auth_user_id = auth.uid() and role = 'driver'
  );
$$;

revoke execute on function is_driver() from public;
grant execute on function is_driver() to authenticated;

-- orders update: раньше право обновить строку целиком проверял только
-- has_order_permission() (админ/диспетчер, либо любой с can_manage_orders).
-- Теперь водителю без can_manage_orders тоже можно попытаться обновить —
-- какие именно колонки ему разрешены, решает триггер ниже.
drop policy "orders update" on orders;
create policy "orders update" on orders for update to authenticated
  using (has_order_permission() or is_driver())
  with check (has_order_permission() or is_driver());

-- Кто создал заказ — нужно для статистики администратора по каждому
-- сотруднику (раздел «видит все срезы статистики... по каждому
-- сотруднику»): без этой колонки заказы дispetчера/админа некому
-- приписать, order_crew тут не поможет (диспетчер обычно не в бригаде).
alter table orders add column if not exists created_by uuid references employees(id) on delete set null;

-- Водителю без can_manage_orders можно менять только scheduled_start/
-- scheduled_end/actual_price, и только в заказе, где он сам в бригаде.
-- У всех остальных (has_order_permission() — админ/диспетчер/любой с
-- can_manage_orders) триггер ничего не запрещает.
-- auth.uid() is null — запрос идёт не от пользователя приложения (SQL-
-- редактор Supabase, миграция, сервисная роль): такой вызов уже доверенный
-- сам по себе, пропускаем без проверки (иначе любой массовый UPDATE orders
-- из будущей миграции упадёт на первой же строке, как это случилось с
-- бэкфиллом company_id в 0013).
create or replace function enforce_driver_order_update()
returns trigger
language plpgsql
security invoker
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if has_order_permission() then
    return new;
  end if;

  if not is_driver() then
    raise exception 'Недостаточно прав для изменения заказа';
  end if;

  if not exists (
    select 1 from order_crew oc
    join employees e on e.id = oc.employee_id
    where oc.order_id = new.id and e.auth_user_id = auth.uid()
  ) then
    raise exception 'Вы не назначены на этот заказ';
  end if;

  -- Перечисляем весь остальной orders построчно (а не только «опасные» на
  -- вид поля) — так добавление новой колонки в будущем по умолчанию тоже
  -- защищено, а не открыто по недосмотру. id/created_at в норме не меняет
  -- даже прямой запрос к REST (id — часть WHERE, created_at выставляется
  -- один раз при создании), но береженого хранит триггер, а не эта норма.
  if new.id is distinct from old.id
     or new.client_id is distinct from old.client_id
     or new.status is distinct from old.status
     or new.cargo_description is distinct from old.cargo_description
     or new.comment is distinct from old.comment
     or new.photos is distinct from old.photos
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Водителю доступны только время и сумма заказа';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_restrict_driver_update on orders;
create trigger orders_restrict_driver_update
  before update on orders
  for each row
  execute function enforce_driver_order_update();

-- create_order — та же сигнатура, дополнительно проставляет created_by
-- (берётся из auth.uid(), клиент его не передаёт).
create or replace function create_order(
  p_client_id uuid,
  p_cargo_description text,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_actual_price numeric,
  p_comment text,
  p_stops jsonb,
  p_crew jsonb,
  p_services jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security invoker
as $$
declare
  new_order_id uuid;
begin
  if not has_order_permission() then
    raise exception 'Недостаточно прав для создания заказа';
  end if;

  if p_client_id is null then
    raise exception 'Заказ без клиента создать нельзя';
  end if;

  insert into orders (client_id, cargo_description, scheduled_start, scheduled_end, actual_price, comment, created_by)
  values (
    p_client_id, p_cargo_description, p_scheduled_start, p_scheduled_end, p_actual_price, p_comment,
    (select id from employees where auth_user_id = auth.uid())
  )
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
