import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllPages, isMissingFunction } from '@/lib/supabaseQuery';
import { useCompanyId } from '@/providers/SessionProvider';
import { formatPhone } from '@/lib/phone';
import { isOrderCompleted } from '@/lib/orderCompletion';
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

type ClientOrderStats = Database['public']['Functions']['client_order_stats']['Returns'][number];

// Вся база клиентов разом: в мобильном приложении поиск отдаёт первые 30,
// а в кабинете нужна полная таблица с сортировкой и выгрузкой. Клиентов
// забираем страницами по 1000, сводку по заказам считает база.
export async function fetchClientsWithStats(companyId: string | null): Promise<ClientWithStats[]> {
  const [clients, stats] = await Promise.all([
    fetchAllPages<Client>((from, to) => {
      let query = supabase.from('clients').select('*');
      if (companyId) query = query.eq('company_id', companyId);
      return query.order('name', { ascending: true }).order('id', { ascending: true }).range(from, to);
    }),
    fetchClientOrderStats(companyId),
  ]);
  const byClient = new Map(stats.map((s) => [s.client_id, s]));
  return clients.map((c) => {
    const s = byClient.get(c.id);
    return {
      ...c,
      ordersCount: s?.orders_count ?? 0,
      completedCount: s?.completed_count ?? 0,
      revenue: Number(s?.revenue ?? 0),
      lastOrderAt: s?.last_order_at ?? null,
    };
  });
}

// Раньше кабинет скачивал для сводки все заказы компании, а PostgREST
// отдавал из них только первую 1000 — у компании постарше цифры были
// неверными. Теперь одна строка на клиента из client_order_stats().
async function fetchClientOrderStats(companyId: string | null): Promise<ClientOrderStats[]> {
  try {
    return await fetchAllPages<ClientOrderStats>((from, to) =>
      supabase.rpc('client_order_stats').order('client_id', { ascending: true }).range(from, to)
    );
  } catch (err) {
    if (!isMissingFunction(err)) throw err;
  }
  // В базе ещё нет функции (миграция не запущена) — считаем сами, как
  // раньше, но по всем страницам заказов, а не по первой тысяче.
  const orders = await fetchAllPages<{
    client_id: string;
    status: OrderStatus;
    actual_price: number | null;
    scheduled_start: string;
    scheduled_end: string;
  }>((from, to) => {
    let query = supabase
      .from('orders')
      .select('client_id, status, actual_price, scheduled_start, scheduled_end')
      .not('client_id', 'is', null);
    if (companyId) query = query.eq('company_id', companyId);
    return query.order('id', { ascending: true }).range(from, to);
  });
  const now = new Date();
  const byClient = new Map<string, ClientOrderStats>();
  for (const o of orders) {
    const entry = byClient.get(o.client_id) ?? {
      client_id: o.client_id,
      orders_count: 0,
      completed_count: 0,
      revenue: 0,
      last_order_at: null,
    };
    entry.orders_count += 1;
    if (isOrderCompleted(o, now)) {
      entry.completed_count += 1;
      entry.revenue += Number(o.actual_price ?? 0);
    }
    if (!entry.last_order_at || o.scheduled_start > entry.last_order_at) entry.last_order_at = o.scheduled_start;
    byClient.set(o.client_id, entry);
  }
  return [...byClient.values()];
}

export function useClientsWithStats() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ['clients', 'with-stats', companyId],
    queryFn: () => fetchClientsWithStats(companyId),
  });
}

// Поиск для формы заказа — по имени или телефону.
export function useClientSearch(search: string) {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ['clients', 'search', companyId, search],
    // Пока ищется новое, в списке остаются прежние варианты, а не пустота.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from('clients').select('*').order('name', { ascending: true }).limit(20);
      if (companyId) query = query.eq('company_id', companyId);
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
          phone: input.phone ? formatPhone(input.phone) : null,
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
          phone: input.phone ? formatPhone(input.phone) : null,
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
            phone: c.phone ? formatPhone(c.phone) : null,
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
            // Раз уже нашли клиента по совпадению телефона — заодно
            // приводим его сохранённый номер к единому формату, даже если
            // сам импортируемый файл записал его иначе (пункт «единый
            // формат для всех телефонов в базе», 2026-09-25).
            ...(u.phone ? { phone: formatPhone(u.phone) } : {}),
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
