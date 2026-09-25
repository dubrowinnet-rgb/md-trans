import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Database, OrderStatus } from '@/types/database';

export type Client = Database['public']['Tables']['clients']['Row'];

// Клиент со сводкой по его заказам — для таблицы «Клиенты» (сортировка
// по выручке, числу заказов, давности последнего заказа).
export interface ClientWithStats extends Client {
  ordersCount: number;
  completedCount: number;
  revenue: number;
  lastOrderAt: string | null;
}

// Вся база клиентов разом: в мобильном приложении поиск отдаёт первые 30,
// а в кабинете нужна полная таблица с сортировкой и выгрузкой. Считаем
// сводку на клиенте — так же, как статистика администратора (api/stats.ts).
export async function fetchClientsWithStats(): Promise<ClientWithStats[]> {
  const [clientsRes, ordersRes] = await Promise.all([
    supabase.from('clients').select('*').order('name', { ascending: true }),
    supabase.from('orders').select('client_id, status, actual_price, scheduled_start'),
  ]);
  if (clientsRes.error) throw clientsRes.error;
  if (ordersRes.error) throw ordersRes.error;
  const orders = ordersRes.data as {
    client_id: string | null;
    status: OrderStatus;
    actual_price: number | null;
    scheduled_start: string;
  }[];
  const byClient = new Map<string, { count: number; completed: number; revenue: number; last: string | null }>();
  for (const o of orders) {
    if (!o.client_id) continue;
    const entry = byClient.get(o.client_id) ?? { count: 0, completed: 0, revenue: 0, last: null };
    entry.count += 1;
    if (o.status === 'completed') {
      entry.completed += 1;
      entry.revenue += Number(o.actual_price ?? 0);
    }
    if (!entry.last || o.scheduled_start > entry.last) entry.last = o.scheduled_start;
    byClient.set(o.client_id, entry);
  }
  return (clientsRes.data as Client[]).map((c) => {
    const s = byClient.get(c.id);
    return {
      ...c,
      ordersCount: s?.count ?? 0,
      completedCount: s?.completed ?? 0,
      revenue: s?.revenue ?? 0,
      lastOrderAt: s?.last ?? null,
    };
  });
}

export function useClientsWithStats() {
  return useQuery({ queryKey: ['clients', 'with-stats'], queryFn: fetchClientsWithStats });
}

// Поиск для формы заказа — по имени или телефону.
export function useClientSearch(search: string) {
  return useQuery({
    queryKey: ['clients', 'search', search],
    queryFn: async () => {
      let query = supabase.from('clients').select('*').order('name', { ascending: true }).limit(20);
      const q = search.trim().replace(/[,()]/g, ' ');
      if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data as Client[];
    },
  });
}

export function useClient(clientId: string | null) {
  return useQuery({
    queryKey: ['clients', 'by-id', clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').eq('id', clientId as string).single();
      if (error) throw error;
      return data as Client;
    },
  });
}

export interface ClientInput {
  name: string;
  phone?: string;
  discount_percent?: number;
  notes?: string;
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClientInput) => {
      const { data, error } = await supabase
        .from('clients')
        .insert({
          name: input.name,
          phone: input.phone || null,
          discount_percent: input.discount_percent ?? 0,
          notes: input.notes || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Client;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: ClientInput & { id: string }) => {
      const { error } = await supabase
        .from('clients')
        .update({
          name: input.name,
          phone: input.phone || null,
          discount_percent: input.discount_percent ?? 0,
          notes: input.notes || null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export interface ClientImportRow {
  name: string;
  phone?: string | null;
  discount_percent?: number;
  notes?: string | null;
}

// Импорт из CSV (components/clients/ClientImportModal.tsx): новые клиенты
// вставляем одним запросом, уже существующих (найденных по телефону)
// обновляем по одному — своего ограничения uq на phone в базе нет, так что
// insert ... on conflict тут не сделать.
export function useImportClients() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      toInsert,
      toUpdate,
    }: {
      toInsert: ClientImportRow[];
      toUpdate: (ClientImportRow & { id: string })[];
    }) => {
      if (toInsert.length > 0) {
        const { error } = await supabase.from('clients').insert(
          toInsert.map((c) => ({
            name: c.name,
            phone: c.phone ?? null,
            discount_percent: c.discount_percent ?? 0,
            notes: c.notes ?? null,
          }))
        );
        if (error) throw error;
      }
      for (const u of toUpdate) {
        const { error } = await supabase
          .from('clients')
          .update({
            name: u.name,
            ...(u.discount_percent !== undefined ? { discount_percent: u.discount_percent } : {}),
            ...(u.notes !== undefined ? { notes: u.notes } : {}),
          })
          .eq('id', u.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

// Удалить можно только клиента без заказов: в базе заказ ссылается на
// клиента без каскада, и удалять историю заказов вместе с клиентом мы не
// хотим.
export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { count, error: countError } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', id);
      if (countError) throw countError;
      if (count && count > 0) {
        throw new Error(`У клиента ${count} заказ(ов) — такого клиента удалить нельзя, чтобы не потерять историю.`);
      }
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}
