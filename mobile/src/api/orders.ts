import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { CrewStatus, Database, EmployeeRole, OrderStatus, StopType } from '../types/database';

type OrderRow = Database['public']['Tables']['orders']['Row'];
type ClientRow = Database['public']['Tables']['clients']['Row'];
type StopRow = Database['public']['Tables']['order_stops']['Row'];
type CrewRow = Database['public']['Tables']['order_crew']['Row'];

export interface OrderWithDetails extends OrderRow {
  clients: Pick<ClientRow, 'id' | 'name' | 'phone' | 'discount_percent'> | null;
  order_stops: StopRow[];
  order_crew: (CrewRow & { employees: { id: string; name: string; role: EmployeeRole } | null })[];
}

const ORDER_SELECT =
  '*, clients(id, name, phone, discount_percent), order_stops(*), order_crew(*, employees(id, name, role))';

export function useOrdersForRange(rangeStart: Date, rangeEnd: Date) {
  const startIso = rangeStart.toISOString();
  const endIso = rangeEnd.toISOString();

  return useQuery({
    queryKey: ['orders', startIso, endIso],
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
  });
}

export function useBusyEmployeeIds(start: Date | null, end: Date | null) {
  const startIso = start?.toISOString() ?? null;
  const endIso = end?.toISOString() ?? null;

  return useQuery({
    queryKey: ['busy-employees', startIso, endIso],
    enabled: Boolean(startIso && endIso),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_crew')
        .select('employee_id, orders!inner(id, scheduled_start, scheduled_end, status)')
        .neq('orders.status', 'cancelled')
        .lt('orders.scheduled_start', endIso as string)
        .gt('orders.scheduled_end', startIso as string);
      if (error) throw error;
      return new Set((data as { employee_id: string }[]).map((row) => row.employee_id));
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

export interface CreateOrderInput {
  client_id: string | null;
  cargo_description: string;
  scheduled_start: Date;
  scheduled_end: Date;
  actual_price: number | null;
  comment: string;
  stops: CreateOrderStopInput[];
  crew: CreateOrderCrewInput[];
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
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['busy-employees'] });
    },
  });
}

export type { OrderStatus, CrewStatus };
