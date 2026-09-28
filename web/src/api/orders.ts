import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabaseQuery';
import { useCompanyId } from '@/providers/SessionProvider';
import { notifyEmployees } from '@/lib/push';
import { friendlyOrderError } from '@/lib/errors';
import type { Database, EmployeeRole, OrderStatus, StopType } from '@/types/database';

type OrderRow = Database['public']['Tables']['orders']['Row'];
type ClientRow = Database['public']['Tables']['clients']['Row'];
type StopRow = Database['public']['Tables']['order_stops']['Row'];
type CrewRow = Database['public']['Tables']['order_crew']['Row'];
type ServiceRow = Database['public']['Tables']['services']['Row'];
type VehicleRow = Database['public']['Tables']['vehicles']['Row'];

export interface OrderWithDetails extends OrderRow {
  clients: Pick<ClientRow, 'id' | 'name' | 'phone' | 'discount_percent'> | null;
  order_stops: StopRow[];
  order_crew: (CrewRow & { employees: { id: string; name: string; role: string } | null })[];
  order_services: { qty: number; services: Pick<ServiceRow, 'id' | 'name' | 'color'> | null }[];
  vehicles: Pick<VehicleRow, 'id' | 'name' | 'plate'> | null;
}

// Тот же набор связанных данных, что и в мобильном приложении
// (mobile/src/api/orders.ts), — карточка заказа и сетка календаря
// рисуются из одной выборки.
const ORDER_SELECT =
  '*, clients(id, name, phone, discount_percent), order_stops(*), order_crew(*, employees(id, name, role)), order_services(qty, services(id, name, color)), vehicles(id, name, plate)';

function invalidateOrders(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['orders'] });
  queryClient.invalidateQueries({ queryKey: ['busy-employees'] });
  queryClient.invalidateQueries({ queryKey: ['client-orders'] });
  queryClient.invalidateQueries({ queryKey: ['clients', 'with-stats'] });
  queryClient.invalidateQueries({ queryKey: ['stats-overview'] });
}

// Нижняя граница по началу заказа для запросов «пересекается с периодом»:
// без неё условие scheduled_end > начало периода заставляет базу перебрать
// все прошлые заказы компании (неделя календаря крупной компании: 0,76 с →
// 0,09 с на тестовой базе). Заказ длиннее месяца не бывает.
const MAX_ORDER_SPAN_MS = 31 * 24 * 60 * 60 * 1000;

function spanFloor(start: Date) {
  return new Date(start.getTime() - MAX_ORDER_SPAN_MS).toISOString();
}

export function useOrdersForRange(rangeStart: Date, rangeEnd: Date) {
  const companyId = useCompanyId();
  const startIso = rangeStart.toISOString();
  const endIso = rangeEnd.toISOString();

  return useQuery({
    queryKey: ['orders', 'range', companyId, startIso, endIso],
    queryFn: () =>
      fetchAllPages<OrderWithDetails>((from, to) => {
        let query = supabase
          .from('orders')
          .select(ORDER_SELECT)
          .lt('scheduled_start', endIso)
          .gte('scheduled_start', spanFloor(rangeStart))
          .gt('scheduled_end', startIso);
        if (companyId) query = query.eq('company_id', companyId);
        return query.order('scheduled_start', { ascending: true }).order('id', { ascending: true }).range(from, to);
      }),
    placeholderData: keepPreviousData,
  });
}

export interface CrewLoadOrder {
  id: string;
  status: OrderStatus;
  scheduled_start: string;
  order_crew: { employee_id: string }[];
}

// Заказы сотрудников по дням для экрана «График»: только время и бригада,
// без клиентов, адресов и услуг (крупной компании за месяц — 0,25 МБ
// вместо 2 МБ). Отменённые не нужны.
export function useCrewLoad(rangeStart: Date, rangeEnd: Date) {
  const companyId = useCompanyId();
  const startIso = rangeStart.toISOString();
  const endIso = rangeEnd.toISOString();

  return useQuery({
    queryKey: ['orders', 'crew-load', companyId, startIso, endIso],
    queryFn: () =>
      fetchAllPages<CrewLoadOrder>((from, to) => {
        let query = supabase
          .from('orders')
          .select('id, status, scheduled_start, order_crew(employee_id)')
          .neq('status', 'cancelled')
          .gte('scheduled_start', startIso)
          .lt('scheduled_start', endIso);
        if (companyId) query = query.eq('company_id', companyId);
        return query.order('scheduled_start', { ascending: true }).order('id', { ascending: true }).range(from, to);
      }),
    placeholderData: keepPreviousData,
  });
}

export function useOrder(orderId: string | null) {
  return useQuery({
    queryKey: ['orders', 'by-id', orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('id', orderId as string)
        .single();
      if (error) throw error;
      return data as unknown as OrderWithDetails;
    },
  });
}

// История заказов клиента — для карточки клиента.
export function useClientOrders(clientId: string | null) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ['client-orders', companyId, clientId],
    enabled: Boolean(clientId),
    queryFn: () =>
      fetchAllPages<OrderWithDetails>((from, to) => {
        let query = supabase.from('orders').select(ORDER_SELECT).eq('client_id', clientId as string);
        if (companyId) query = query.eq('company_id', companyId);
        return query.order('scheduled_start', { ascending: false }).order('id', { ascending: true }).range(from, to);
      }),
  });
}

// Кто из сотрудников занят другим заказом в этот интервал (для точек
// доступности в форме). excludeOrderId — сам редактируемый заказ, иначе
// его бригада считалась бы занятой сама собой. Идём от заказов компании,
// а не от order_crew: у бригад нет своей колонки компании, и такой запрос
// перебирал строки бригад всех компаний сервиса (0,2–0,5 с → 0,01 с).
export function useBusyEmployeeIds(start: Date | null, end: Date | null, excludeOrderId?: string | null) {
  const companyId = useCompanyId();
  const startIso = start?.toISOString() ?? null;
  const endIso = end?.toISOString() ?? null;

  return useQuery({
    queryKey: ['busy-employees', companyId, startIso, endIso, excludeOrderId ?? null],
    enabled: Boolean(start && end),
    queryFn: async () => {
      const rows = await fetchAllPages<{ id: string; order_crew: { employee_id: string }[] }>((from, to) => {
        let query = supabase
          .from('orders')
          .select('id, order_crew(employee_id)')
          .neq('status', 'cancelled')
          .lt('scheduled_start', endIso as string)
          .gte('scheduled_start', spanFloor(start as Date))
          .gt('scheduled_end', startIso as string);
        if (companyId) query = query.eq('company_id', companyId);
        if (excludeOrderId) query = query.neq('id', excludeOrderId);
        return query.order('id', { ascending: true }).range(from, to);
      });
      return new Set(rows.flatMap((o) => o.order_crew.map((c) => c.employee_id)));
    },
  });
}

export interface OrderStopInput {
  type: StopType;
  address: string;
  order_index: number;
  is_primary: boolean;
}

export interface OrderCrewInput {
  employee_id: string;
  role: EmployeeRole;
}

export interface OrderInput {
  client_id: string;
  cargo_description: string;
  scheduled_start: Date;
  scheduled_end: Date;
  actual_price: number | null;
  comment: string;
  stops: OrderStopInput[];
  crew: OrderCrewInput[];
  service_ids: string[];
  vehicle_id: string | null;
}

async function createOrder(input: OrderInput) {
  const { data, error } = await supabase.rpc('create_order', {
    p_client_id: input.client_id,
    p_cargo_description: input.cargo_description || null,
    p_scheduled_start: input.scheduled_start.toISOString(),
    p_scheduled_end: input.scheduled_end.toISOString(),
    p_actual_price: input.actual_price,
    p_comment: input.comment || null,
    p_stops: input.stops,
    p_crew: input.crew,
    p_services: input.service_ids.map((id) => ({ service_id: id, qty: 1 })),
    p_vehicle_id: input.vehicle_id,
  });
  if (error) throw await friendlyOrderError(error);
  const orderId = data as string;
  await notifyEmployees(
    input.crew.map((c) => c.employee_id),
    'Новый заказ',
    'Вам назначен новый заказ',
    { orderId }
  );
  return orderId;
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createOrder,
    onSuccess: () => invalidateOrders(queryClient),
  });
}

// Полное редактирование заказа (в мобильном приложении пока есть только
// смена статуса и узкая правка водителя). Отдельной RPC под это в базе нет,
// поэтому идём по таблицам, как разрешает RLS для has_order_permission():
// сам заказ, затем точки маршрута и услуги целиком заменяем, а бригаду
// меняем разницей — у тех, кто остался, сохраняется «принял заказ».
export function useUpdateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; input: OrderInput; previous: OrderWithDetails }) => {
      try {
        await updateOrder(vars);
      } catch (err) {
        throw await friendlyOrderError(err);
      }
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}

async function updateOrder({ id, input, previous }: { id: string; input: OrderInput; previous: OrderWithDetails }) {
  const { error: orderError } = await supabase
    .from('orders')
    .update({
      client_id: input.client_id,
      cargo_description: input.cargo_description || null,
      scheduled_start: input.scheduled_start.toISOString(),
      scheduled_end: input.scheduled_end.toISOString(),
      actual_price: input.actual_price,
      comment: input.comment || null,
      vehicle_id: input.vehicle_id,
    })
    .eq('id', id);
  if (orderError) throw orderError;

  const { error: delStopsError } = await supabase.from('order_stops').delete().eq('order_id', id);
  if (delStopsError) throw delStopsError;
  if (input.stops.length > 0) {
    const { error } = await supabase.from('order_stops').insert(input.stops.map((s) => ({ ...s, order_id: id })));
    if (error) throw error;
  }

  const { error: delServicesError } = await supabase.from('order_services').delete().eq('order_id', id);
  if (delServicesError) throw delServicesError;
  if (input.service_ids.length > 0) {
    const { error } = await supabase
      .from('order_services')
      .insert(input.service_ids.map((service_id) => ({ order_id: id, service_id, qty: 1 })));
    if (error) throw error;
  }

  const key = (c: { employee_id: string; role: string }) => `${c.employee_id}:${c.role}`;
  const nextKeys = new Set(input.crew.map(key));
  const prevKeys = new Set(previous.order_crew.map(key));
  for (const c of previous.order_crew) {
    if (nextKeys.has(key(c))) continue;
    const { error } = await supabase
      .from('order_crew')
      .delete()
      .eq('order_id', id)
      .eq('employee_id', c.employee_id)
      .eq('role', c.role);
    if (error) throw error;
  }
  const added = input.crew.filter((c) => !prevKeys.has(key(c)));
  if (added.length > 0) {
    const { error } = await supabase.from('order_crew').insert(
      added.map((c) => ({
        order_id: id,
        employee_id: c.employee_id,
        role: c.role,
        status: 'notified' as const,
        notified_at: new Date().toISOString(),
      }))
    );
    if (error) throw error;
  }

  const newIds = [...new Set(added.map((c) => c.employee_id))];
  const alreadyThere = new Set(previous.order_crew.map((c) => c.employee_id));
  await notifyEmployees(
    newIds.filter((e) => !alreadyThere.has(e)),
    'Новый заказ',
    'Вам назначен новый заказ',
    { orderId: id }
  );
  const timeChanged =
    new Date(previous.scheduled_start).getTime() !== input.scheduled_start.getTime() ||
    new Date(previous.scheduled_end).getTime() !== input.scheduled_end.getTime();
  if (timeChanged) {
    await notifyEmployees(
      input.crew.map((c) => c.employee_id).filter((e) => alreadyThere.has(e)),
      'Заказ перенесён',
      'Время заказа изменилось — откройте заказ',
      { orderId: id }
    );
  }
}

// Перенос заказа на другое время (перетаскивание в календаре) — меняются
// только начало и окончание, всё остальное остаётся.
export function useMoveOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ order, start, end }: { order: OrderWithDetails; start: Date; end: Date }) => {
      const { error } = await supabase
        .from('orders')
        .update({ scheduled_start: start.toISOString(), scheduled_end: end.toISOString() })
        .eq('id', order.id);
      if (error) throw await friendlyOrderError(error);
      await notifyEmployees(
        order.order_crew.map((c) => c.employee_id),
        'Заказ перенесён',
        'Время заказа изменилось — откройте заказ',
        { orderId: order.id }
      );
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}

// Превращает существующий заказ в данные для формы/копии.
export function orderToInput(order: OrderWithDetails): OrderInput {
  return {
    client_id: order.client_id ?? '',
    cargo_description: order.cargo_description ?? '',
    scheduled_start: new Date(order.scheduled_start),
    scheduled_end: new Date(order.scheduled_end),
    actual_price: order.actual_price,
    comment: order.comment ?? '',
    stops: [...order.order_stops]
      .sort((a, b) => a.order_index - b.order_index)
      .map((s) => ({ type: s.type, address: s.address, order_index: s.order_index, is_primary: s.is_primary })),
    crew: order.order_crew.map((c) => ({ employee_id: c.employee_id, role: c.role })),
    service_ids: order.order_services.map((s) => s.services?.id).filter((id): id is string => Boolean(id)),
    vehicle_id: order.vehicle_id,
  };
}

// Копия заказа на новое время: тот же клиент, маршрут, услуги, сумма и
// бригада (бригаду можно не копировать — тогда заказ создаётся без неё).
export function useCopyOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      order,
      start,
      end,
      withCrew,
    }: {
      order: OrderWithDetails;
      start: Date;
      end: Date;
      withCrew: boolean;
    }) => {
      const input = orderToInput(order);
      return createOrder({
        ...input,
        scheduled_start: start,
        scheduled_end: end,
        crew: withCrew ? input.crew : [],
        vehicle_id: withCrew ? input.vehicle_id : null,
      });
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc('delete_order', { p_order_id: orderId });
      if (error) throw error;
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}

// Статусы заказа сведены к «активен/отменён» (доработки 2, п.2) — new/
// confirmed/in_progress/completed больше не выбираются вручную ни в
// одном интерфейсе; «завершён» теперь определяется по времени
// (см. lib/orderCompletion.ts), а не проставляется руками. ACTIVE_ORDER_STATUS —
// значение, в которое переходит заказ при возврате из «отменён» (то же,
// что и DEFAULT в БД для новых заказов).
export const ACTIVE_ORDER_STATUS: OrderStatus = 'new';

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}

export interface OrdersFilter {
  from: Date;
  to: Date;
}

// Список заказов за период — для таблицы «Заказы» и выгрузки. По состоянию
// (активные/завершённые/отменённые) фильтруют сами экраны — «завершён»
// считается по времени, а не хранится в статусе.
export function useOrdersList(filter: OrdersFilter) {
  const companyId = useCompanyId();
  const fromIso = filter.from.toISOString();
  const toIso = filter.to.toISOString();
  return useQuery({
    queryKey: ['orders', 'list', companyId, fromIso, toIso],
    queryFn: () => fetchOrdersList(filter, companyId),
    placeholderData: keepPreviousData,
  });
}

export function fetchOrdersList(filter: OrdersFilter, companyId: string | null) {
  return fetchAllPages<OrderWithDetails>((from, to) => {
    let query = supabase
      .from('orders')
      .select(ORDER_SELECT)
      .gte('scheduled_start', filter.from.toISOString())
      .lt('scheduled_start', filter.to.toISOString());
    if (companyId) query = query.eq('company_id', companyId);
    return query.order('scheduled_start', { ascending: true }).order('id', { ascending: true }).range(from, to);
  });
}
