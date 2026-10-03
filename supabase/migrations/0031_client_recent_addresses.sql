-- Максим, 02.10: подсказки адреса в заказе должны сперва предлагать адреса
-- ЭТОГО заказчика (повторяются по клиентам), а не только общие по компании
-- (recent_addresses, 0016) — та уже существующая функция остаётся как есть
-- и используется отдельно, пока клиент ещё не выбран / как добавочный тираж.
--
-- Файл можно выполнить повторно.
create or replace function client_recent_addresses(p_client_id uuid, p_limit int default 8)
returns table(address text, uses bigint)
language sql stable security invoker as $$
  select os.address, count(*) as uses
  from order_stops os
  join orders o on o.id = os.order_id
  where o.company_id = get_my_company_id()
    and o.client_id = p_client_id
  group by os.address
  order by count(*) desc, max(o.created_at) desc
  limit p_limit;
$$;

revoke execute on function client_recent_addresses(uuid, int) from public;
grant execute on function client_recent_addresses(uuid, int) to authenticated;
