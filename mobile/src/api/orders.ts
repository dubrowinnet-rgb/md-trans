import { useCallback } from 'react';
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { addDays } from 'date-fns';
import { supabase } from '../lib/supabase';
import { selectAll } from '../lib/selectAll';
import { sendPushNotifications } from '../lib/pushNotifications';
import type { CrewStatus, Database, EmployeeRole, OrderStatus, StopType } from '../types/database';

type OrderRow = Database['public']['Tables']['orders']['Row'];
type ClientRow = Database['public']['Tables']['clients']['Row'];
type StopRow = Database['public']['Tables']['order_stops']['Row'];
type CrewRow = Database['public']['Tables']['order_crew']['Row'];
type ServiceRow = Database['public']['Tables']['services']['Row'];
type VehicleRow = Database['public']['Tables']['vehicles']['Row'];

export interface OrderWithDetails extends OrderRow {
  clients: Pick<ClientRow, 'id' | 'name' | 'phone' | 'discount_percent'> | null;
  order_stops: StopRow[];
  order_crew: (CrewRow & { employees: { id: string; name: string; role: EmployeeRole } | null })[];
  order_services: { qty: number; services: Pick<ServiceRow, 'id' | 'name' | 'color'> | null }[];
  vehicles: Pick<VehicleRow, 'id' | 'name' | 'plate'> | null;
}

const ORDER_SELECT =
  '*, clients(id, name, phone, discount_percent), order_stops(*), order_crew(*, employees(id, name, role)), order_services(qty, services(id, name, color)), vehicles(id, name, plate)';

// Заказ в сетке календаря (components/calendar/*) — только то, что там
// рисуется. Полностью заказ загружается при открытии (useOrder).
export interface CalendarOrder {
  id: string;
  status: OrderStatus;
  scheduled_start: string;
  scheduled_end: string;
  cargo_description: string | null;
  clients: { name: string } | null;
  order_stops: Pick<StopRow, 'type' | 'address' | 'is_primary'>[];
  order_crew: Pick<CrewRow, 'employee_id' | 'role' | 'status'>[];
  order_services: { services: Pick<ServiceRow, 'name' | 'color'> | null }[];
}

const CALENDAR_SELECT =
  'id, status, scheduled_start, scheduled_end, cargo_description, clients(name), order_stops(type, address, is_primary), order_crew(employee_id, role, status), order_services(services(name, color))';
// Второй раз order_crew — только как фильтр «я в бригаде»: полная бригада
// в карточке остаётся.
const CALENDAR_SELECT_MINE = `${CALENDAR_SELECT}, mine:order_crew!inner(employee_id)`;

// Заказы календаря — отдельным запросом на каждую страницу (1, 3 или 7
// дней), а не одним на все пять отрисованных: при листании четыре страницы
// уже в кэше и догружается одна (раньше каждое перелистывание заново
// тянуло 15–35 дней заказов). onlyEmployeeId — календарь водителя/грузчика:
// сервер сразу отдаёт только его заказы, без заказов всей компании.
export function useCalendarOrders(pageStarts: Date[], days: number, onlyEmployeeId?: string) {
  const combine = useCallback((results: UseQueryResult<CalendarOrder[]>[]) => {
    const byId = new Map<string, CalendarOrder>();
    for (const result of results) {
      for (const order of result.data ?? []) byId.set(order.id, order);
    }
    // Самое свежее из времён успешного обновления страниц — «когда в
    // последний раз пришли свежие данные», для индикатора синхронизации в
    // EmployeeMenu. 0, если ни одна страница ещё не загрузилась ни разу.
    const dataUpdatedAt = results.reduce((max, r) => Math.max(max, r.dataUpdatedAt), 0);
    return {
      orders: [...byId.values()],
      isFetching: results.some((r) => r.isFetching),
      error: results.find((r) => r.error)?.error ?? null,
      dataUpdatedAt,
    };
  }, []);

  return useQueries({
    queries: pageStarts.map((pageStart) => {
      const startIso = pageStart.toISOString();
      const endIso = addDays(pageStart, days).toISOString();
      return {
        queryKey: ['orders', 'calendar', startIso, endIso, onlyEmployeeId ?? null],
        queryFn: () =>
          selectAll<CalendarOrder>((from, to) => {
            let query = supabase
              .from('orders')
              .select(onlyEmployeeId ? CALENDAR_SELECT_MINE : CALENDAR_SELECT)
              .lt('scheduled_start', endIso)
              .gt('scheduled_end', startIso);
            if (onlyEmployeeId) query = query.eq('mine.employee_id', onlyEmployeeId);
            return query.order('scheduled_start', { ascending: true }).order('id', { ascending: true }).range(from, to);
          }),
        // Пока страница грузится, показываем то, что было на этом месте,
        // чтобы сетка не мигала.
        placeholderData: keepPreviousData,
        staleTime: 30_000,
        // Автосинхронизация раз в минуту, пока экран открыт (Максим,
        // 30.09, «Правки 3», п.5) — по умолчанию останавливается, когда
        // приложение свёрнуто (refetchIntervalInBackground не включён),
        // так что в фоне лишней нагрузки нет.
        refetchInterval: 60_000,
      };
    }),
    combine,
  });
}

// Кто занят в это время (подсказка в форме заказа и в выборе бригады).
// Ищем от заказов, пересекающихся по времени, — база находит их по
// индексу «компания + время». Прежний запрос от order_crew с фильтром по
// вложенному заказу перебирал всю таблицу бригад: 0,3–1 с на большой базе.
export function useBusyEmployeeIds(start: Date | null, end: Date | null) {
  const startIso = start?.toISOString() ?? null;
  const endIso = end?.toISOString() ?? null;

  return useQuery({
    queryKey: ['busy-employees', startIso, endIso],
    enabled: Boolean(startIso && endIso),
    queryFn: async () => {
      const rows = await selectAll<{ order_crew: { employee_id: string }[] }>((from, to) =>
        supabase
          .from('orders')
          .select('id, order_crew(employee_id)')
          .neq('status', 'cancelled')
          .lt('scheduled_start', endIso as string)
          .gt('scheduled_end', startIso as string)
          .order('id', { ascending: true })
          .range(from, to)
      );
      return new Set(rows.flatMap((order) => order.order_crew.map((c) => c.employee_id)));
    },
  });
}

export function useConfirmCrew() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, employeeId }: { orderId: string; employeeId: string }) => {
      const { error } = await supabase
        .from('order_crew')
        .update({ status: 'confirmed', read_at: new Date().toISOString() })
        .eq('order_id', orderId)
        .eq('employee_id', employeeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

// Отмечает, что сотрудник открыл заказ (раздел 9.5). Вызывающая сторона
// сама решает, когда это уместно (обычно — только если статус ещё
// 'notified'), чтобы случайно не откатить уже подтверждённый статус.
export function useMarkCrewRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, employeeId }: { orderId: string; employeeId: string }) => {
      const { error } = await supabase
        .from('order_crew')
        .update({ status: 'read', read_at: new Date().toISOString() })
        .eq('order_id', orderId)
        .eq('employee_id', employeeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export interface CreateOrderStopInput {
  type: StopType;
  address: string;
  order_index: number;
  is_primary: boolean;
}

export interface CreateOrderCrewInput {
  employee_id: string;
  role: EmployeeRole;
}

export interface CreateOrderServiceInput {
  service_id: string;
  qty: number;
}

export interface CreateOrderInput {
  client_id: string;
  cargo_description: string;
  scheduled_start: Date;
  scheduled_end: Date;
  actual_price: number | null;
  comment: string;
  stops: CreateOrderStopInput[];
  crew: CreateOrderCrewInput[];
  services: CreateOrderServiceInput[];
  vehicle_id?: string | null;
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      const { data, error } = await supabase.rpc('create_order', {
        p_client_id: input.client_id,
        p_cargo_description: input.cargo_description || null,
        p_scheduled_start: input.scheduled_start.toISOString(),
        p_scheduled_end: input.scheduled_end.toISOString(),
        p_actual_price: input.actual_price,
        p_comment: input.comment || null,
        p_stops: input.stops,
        p_crew: input.crew,
        p_services: input.services,
        p_vehicle_id: input.vehicle_id ?? null,
      });
      if (error) throw error;
      const orderId = data as string;

      if (input.crew.length > 0) {
        const { data: crewEmployees } = await supabase
          .from('employees')
          .select('expo_push_token')
          .in(
            'id',
            input.crew.map((c) => c.employee_id)
          );
        const tokens = (crewEmployees ?? [])
          .map((e) => e.expo_push_token)
          .filter((t): t is string => Boolean(t));
        await sendPushNotifications(tokens, 'Новый заказ', 'Вам назначен новый заказ', { orderId });
      }

      // Автоматическая отправка смс клиенту через sms.ru отменена
      // 2026-09-26 (решение Максима — гейтвей не нужен, диспетчер сам
      // отправляет смс со своего телефона). Экран создания заказа
      // открывает системный экран смс с уже подставленным текстом сразу
      // после успешного создания — см. lib/smsCompose.ts и order/new.tsx.

      return orderId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['busy-employees'] });
    },
  });
}

// Удаление заказа (раздел «удалять заказы») — раньше в приложении был
// только перевод в статус «отменён», настоящего удаления не было.
// Проверка прав — в самой RPC (миграция 0005), здесь для UI важен только
// вызов.
export function useDeleteOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc('delete_order', { p_order_id: orderId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['busy-employees'] });
    },
  });
}

// Узкое обновление для водителя без can_manage_orders (раздел «права» —
// водитель редактирует только время и сумму заказа). Какие именно колонки
// можно менять, проверяет и триггер в БД (миграция 0006) — здесь просто
// вызов, без своей проверки прав.
export function useUpdateOrderScheduleAndPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      scheduledStart,
      scheduledEnd,
      actualPrice,
    }: {
      orderId: string;
      scheduledStart: Date;
      scheduledEnd: Date;
      actualPrice: number | null;
    }) => {
      const { error } = await supabase
        .from('orders')
        .update({
          scheduled_start: scheduledStart.toISOString(),
          scheduled_end: scheduledEnd.toISOString(),
          actual_price: actualPrice,
        })
        .eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['busy-employees'] });
    },
  });
}

export interface UpdateOrderCrewInput {
  orderId: string;
  vehicleId: string | null;
  crew: CreateOrderCrewInput[];
}

// Смена экипажа/машины уже созданного заказа (раздел «редактирование
// экипажа» — выбор/замена должны быть кликабельными и в уже созданном
// заказе, не только при создании). Не трогаем строки, которые не
// изменились, — иначе уже принятый («принял заказ») сотрудник без
// причины откатился бы обратно в «уведомлён» только из-за того, что
// диалог открыли и сохранили.
export function useUpdateOrderCrew() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, vehicleId, crew }: UpdateOrderCrewInput) => {
      const { data: current, error: currentError } = await supabase
        .from('order_crew')
        .select('employee_id, role')
        .eq('order_id', orderId);
      if (currentError) throw currentError;

      const key = (c: { employee_id: string; role: string }) => `${c.employee_id}:${c.role}`;
      const nextKeys = new Set(crew.map(key));
      const currentKeys = new Set((current ?? []).map(key));
      const toRemove = (current ?? []).filter((c) => !nextKeys.has(key(c)));
      const toAdd = crew.filter((c) => !currentKeys.has(key(c)));

      for (const row of toRemove) {
        const { error } = await supabase
          .from('order_crew')
          .delete()
          .eq('order_id', orderId)
          .eq('employee_id', row.employee_id)
          .eq('role', row.role);
        if (error) throw error;
      }
      if (toAdd.length > 0) {
        const { error } = await supabase.from('order_crew').insert(
          toAdd.map((c) => ({
            order_id: orderId,
            employee_id: c.employee_id,
            role: c.role,
            status: 'notified',
            notified_at: new Date().toISOString(),
          }))
        );
        if (error) throw error;
      }

      const { error: vehicleError } = await supabase.from('orders').update({ vehicle_id: vehicleId }).eq('id', orderId);
      if (vehicleError) throw vehicleError;

      if (toAdd.length > 0) {
        const { data: addedEmployees } = await supabase
          .from('employees')
          .select('expo_push_token')
          .in('id', toAdd.map((c) => c.employee_id));
        const tokens = (addedEmployees ?? [])
          .map((e) => e.expo_push_token)
          .filter((t): t is string => Boolean(t));
        await sendPushNotifications(tokens, 'Изменение экипажа', 'Вас назначили на заказ', { orderId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['busy-employees'] });
    },
  });
}

// Статусы заказа сведены к «активен/отменён» (доработки 2, п.2) — new/
// confirmed/in_progress/completed больше не выбираются вручную ни в одном
// экране; «выполнен» на календаре определяется по времени (orderLayout.ts),
// а не проставляется руками. ACTIVE_ORDER_STATUS — значение, в которое
// переходит заказ при возврате из «отменён» (совпадает с web/src/api/orders.ts
// и с DEFAULT в БД для новых заказов).
export const ACTIVE_ORDER_STATUS: OrderStatus = 'new';

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: OrderStatus }) => {
      const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['busy-employees'] });
    },
  });
}

export type { OrderStatus, CrewStatus };

export function useOrder(orderId: string | undefined) {
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
