-- Роли входа и права доступа (раздел «Разделить входы» — админ,
-- диспетчер, водитель, грузчик у каждого свой логин/пароль).
--
-- До этой миграции диспетчером считался любой вошедший пользователь без
-- строки в employees — так было устроено с самого начала. Теперь у
-- каждого, кто входит в приложение, есть строка в employees со своей
-- ролью, и без неё доступа нет. ВАЖНО: см. supabase/README.md — после
-- выполнения этого файла нужно ОДНИМ запросом сделать свою текущую
-- учётную запись администратором, иначе следующий вход не пустит внутрь.

alter table employees drop constraint employees_role_check;
alter table employees add constraint employees_role_check
  check (role in ('admin', 'dispatcher', 'driver', 'loader'));

-- Логин, под которым администратор заводит аккаунт (см. Edge Function
-- create-account). У сотрудников, заведённых до этой миграции напрямую в
-- Supabase, login остаётся пустым — это не мешает входу по email.
alter table employees add column if not exists login text;
alter table employees add constraint employees_login_key unique (login);

-- Один auth-пользователь — одна строка employees.
alter table employees add constraint employees_auth_user_id_key unique (auth_user_id);

-- Права доступа (раздел ТЗ из запроса): создавать/удалять/редактировать
-- заказы; смотреть историю и статистику по клиентам; видеть контакты и
-- суммы заказов. У администратора всегда все три — приложение не даёт их
-- выключить, флаги значимы только для диспетчера, водителя и грузчика.
alter table employees add column if not exists can_manage_orders boolean not null default true;
alter table employees add column if not exists can_view_client_stats boolean not null default true;
alter table employees add column if not exists can_view_contacts_and_amounts boolean not null default true;

-- ==========================================================================
-- Вспомогательные функции для RLS и RPC — читают роль/права вошедшего по
-- auth.uid(), без повторения одного и того же подзапроса в каждой политике.
-- ==========================================================================
create or replace function is_admin() returns boolean
language sql stable security invoker as $$
  select exists (
    select 1 from employees where auth_user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function has_order_permission() returns boolean
language sql stable security invoker as $$
  select exists (
    select 1 from employees
    where auth_user_id = auth.uid()
      and (role = 'admin' or can_manage_orders)
  );
$$;

revoke execute on function is_admin() from public;
revoke execute on function has_order_permission() from public;
grant execute on function is_admin() to authenticated;
grant execute on function has_order_permission() to authenticated;

-- ==========================================================================
-- employees — заводить/менять аккаунты может только администратор.
-- Создание аккаунта с паролем всё равно идёт через Edge Function
-- (service role, видит его только сервер), эта политика — от прямых
-- запросов к таблице. Свою строку (например, push-токен) может менять и
-- сам сотрудник.
-- ==========================================================================
drop policy "authenticated full access" on employees;
create policy "employees select" on employees for select to authenticated using (true);
create policy "employees insert by admin" on employees for insert to authenticated with check (is_admin());
create policy "employees update" on employees for update to authenticated
  using (is_admin() or auth_user_id = auth.uid())
  with check (is_admin() or auth_user_id = auth.uid());
create policy "employees delete by admin" on employees for delete to authenticated using (is_admin());

-- ==========================================================================
-- orders / order_stops / order_services — создавать, менять и удалять
-- заказы может администратор или тот, у кого включено can_manage_orders.
-- Читать по-прежнему может любой вошедший (нужно для календаря и своих
-- заказов у водителя/грузчика).
-- ==========================================================================
drop policy "authenticated full access" on orders;
create policy "orders select" on orders for select to authenticated using (true);
create policy "orders insert" on orders for insert to authenticated with check (has_order_permission());
create policy "orders update" on orders for update to authenticated
  using (has_order_permission()) with check (has_order_permission());
create policy "orders delete" on orders for delete to authenticated using (has_order_permission());

drop policy "authenticated full access" on order_stops;
create policy "order_stops select" on order_stops for select to authenticated using (true);
create policy "order_stops insert" on order_stops for insert to authenticated with check (has_order_permission());
create policy "order_stops update" on order_stops for update to authenticated
  using (has_order_permission()) with check (has_order_permission());
create policy "order_stops delete" on order_stops for delete to authenticated using (has_order_permission());

drop policy "authenticated full access" on order_services;
create policy "order_services select" on order_services for select to authenticated using (true);
create policy "order_services insert" on order_services for insert to authenticated with check (has_order_permission());
create policy "order_services update" on order_services for update to authenticated
  using (has_order_permission()) with check (has_order_permission());
create policy "order_services delete" on order_services for delete to authenticated using (has_order_permission());

-- order_crew — то же самое, но сотрудник дополнительно всегда может
-- обновить свою собственную строку (отметка «открыл»/«принял заказ»,
-- раздел 9.5 — она не о правах диспетчера).
drop policy "authenticated full access" on order_crew;
create policy "order_crew select" on order_crew for select to authenticated using (true);
create policy "order_crew insert" on order_crew for insert to authenticated with check (has_order_permission());
create policy "order_crew update" on order_crew for update to authenticated
  using (has_order_permission() or employee_id in (select id from employees where auth_user_id = auth.uid()))
  with check (has_order_permission() or employee_id in (select id from employees where auth_user_id = auth.uid()));
create policy "order_crew delete" on order_crew for delete to authenticated using (has_order_permission());

-- ==========================================================================
-- create_order — та же сигнатура, добавлена явная проверка прав с понятной
-- ошибкой (без неё запрос всё равно отклонит RLS выше, но сообщением
-- «new row violates row-level security policy», которое не покажешь
-- диспетчеру как есть).
-- ==========================================================================
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

-- delete_order — раньше в приложении не было удаления заказов вообще
-- (только отмена сменой статуса), теперь это отдельное действие с
-- проверкой прав и понятной ошибкой.
create or replace function delete_order(p_order_id uuid) returns void
language plpgsql
security invoker
as $$
begin
  if not has_order_permission() then
    raise exception 'Недостаточно прав для удаления заказа';
  end if;
  delete from orders where id = p_order_id;
end;
$$;

revoke execute on function delete_order(uuid) from public;
grant execute on function delete_order(uuid) to authenticated;
