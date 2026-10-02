import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// Часто используемые адреса СВОЕЙ компании (доработки 3, п.2) — считает
// сервер по всем прошлым заказам (supabase/migrations/0016, recent_addresses),
// без новой таблицы. Подсказка под полем адреса в форме заказа.
export function useRecentAddresses() {
  return useQuery({
    queryKey: ['recent-addresses'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('recent_addresses', { p_limit: 8 });
      if (error) throw error;
      return (data ?? []).map((row) => row.address);
    },
    staleTime: 5 * 60 * 1000,
  });
}

// Адреса ЭТОГО заказчика (Максим, 02.10) — повторяются по клиентам, поэтому
// отдельная подсказка в приоритете над общими по компании (recent_addresses
// выше): supabase/migrations/0031, client_recent_addresses. Выключен, пока
// клиент не выбран.
export function useClientRecentAddresses(clientId: string | null) {
  return useQuery({
    queryKey: ['recent-addresses', 'client', clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('client_recent_addresses', {
        p_client_id: clientId as string,
        p_limit: 8,
      });
      if (error) throw error;
      return (data ?? []).map((row) => row.address);
    },
    staleTime: 5 * 60 * 1000,
  });
}
