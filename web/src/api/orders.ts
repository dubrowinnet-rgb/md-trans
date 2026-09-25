import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
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
  queryClient.invalidateQueries({ queryKey: ['client-stats'] });
  queryClient.invalidateQueries({ queryKey: ['stats-overview'] });
}

export function useOrdersForRange(rangeStart: Date, rangeEnd: Date) {
  const startIso = rangeStart.toISOString();
  const endIso = rangeEnd.toISOString();

  return useQuery({
    queryKey: ['orders', 'range', startIso, endIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .lt('scheduled_start', endIso)
        .gt('scheduled_end', startIso)
        .order('scheduled_start', { ascending: true });
      if (error) throw error;
      return data as unknown as OrderWithDetails[];
    },
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
  return useQuery({
    queryKey: ['client-orders', clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('client_id', clientId as string)
        .order('scheduled_start', { ascending: false });
      if (error) throw error;
      return data as unknown as OrderWithDetails[];
    },
  });
}

// Кто из сотрудников занят другим заказом в этот интервал (для точек
// доступности в форме). excludeOrderId — сам редактируемый заказ, иначе
// его бригада считалась бы занятой сама собой.
export function useBusyEmployeeIds(start: Date | null, end: Date | null, excludeOrderId?: string | null) {
  const startIso = start?.toISOString() ?? null;
  const endIso = end?.toISOString() ?? null;

  return useQuery({
    queryKey: ['busy-employees', startIso, endIso, excludeOrderId ?? null],
    enabled: Boolean(startIso && endIso),
    queryFn: async () => {
      let query = supabase
        .from('order_crew')
        .select('employee_id, orders!inner(id, scheduled_start, scheduled_end, status)')
        .neq('orders.status', 'cancelled')
        .lt('orders.scheduled_start', endIso as string)
        .gt('orders.scheduled_end', startIso as string);
      if (excludeOrderId) query = query.neq('order_id', excludeOrderId);
      const { data, error } = await query;
      if (error) throw error;
      return new Set((data as { employee_id: string }[]).map((row) => row.employee_id));
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
// (см. orderLayout.ts), а не проставляется руками. ACTIVE_ORDER_STATUS —
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
  statuses: OrderStatus[];
}

// Список заказов за период — для таблицы «Заказы» и выгрузки.
export function useOrdersList(filter: OrdersFilter) {
  const fromIso = filter.from.toISOString();
  const toIso = filter.to.toISOString();
  return useQuery({
    queryKey: ['orders', 'list', fromIso, toIso, filter.statuses.join(',')],
    queryFn: () => fetchOrdersList(filter),
    placeholderData: keepPreviousData,
  });
}

export async function fetchOrdersList(filter: OrdersFilter) {
  let query = supabase
    .from('orders')
    .select(ORDER_SELECT)
    .gte('scheduled_start', filter.from.toISOString())
    .lt('scheduled_start', filter.to.toISOString())
    .order('scheduled_start', { ascending: true });
  if (filter.statuses.length > 0) query = query.in('status', filter.statuses);
  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as OrderWithDetails[];
}
