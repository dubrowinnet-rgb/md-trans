import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { StopType } from '@/types/database';

// Часто используемые адреса (доработки 3, п.2) — считаем прямо из истории
// точек заказов (order_stops), без отдельной таблицы: RLS на order_stops
// уже ограничивает выборку своей компанией. Яндекс-подсказки при вводе —
// отдельная часть той же задачи, ждёт API-ключ Яндекса.
const HISTORY_LIMIT = 2000;
const SUGGESTIONS_PER_TYPE = 8;

export function useFrequentAddresses() {
  return useQuery({
    queryKey: ['frequent-addresses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_stops')
        .select('address, type')
        .limit(HISTORY_LIMIT);
      if (error) throw error;

      const counts: Record<StopType, Map<string, number>> = { pickup: new Map(), dropoff: new Map() };
      for (const row of data) {
        const address = row.address.trim();
        if (!address) continue;
        const byType = counts[row.type as StopType];
        byType.set(address, (byType.get(address) ?? 0) + 1);
      }

      const topAddresses = (type: StopType) =>
        [...counts[type].entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, SUGGESTIONS_PER_TYPE)
          .map(([address]) => address);

      return { pickup: topAddresses('pickup'), dropoff: topAddresses('dropoff') };
    },
    staleTime: 5 * 60 * 1000,
  });
}
