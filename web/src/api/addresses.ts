import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Часто используемые адреса своей компании (доработки 3, п.2) — общий с
// мобильным приложением RPC (recent_addresses, supabase/migrations/0016):
// считает сервер по всем прошлым точкам заказов, без разделения на
// погрузку/выгрузку (один и тот же адрес нередко бывает и тем, и другим) и
// без новой таблицы. Подсказки под полями адреса в форме заказа.
export function useFrequentAddresses() {
  return useQuery({
    queryKey: ['frequent-addresses'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('recent_addresses', { p_limit: 8 });
      if (error) throw error;
      return data.map((row) => row.address);
    },
    staleTime: 5 * 60 * 1000,
  });
}
