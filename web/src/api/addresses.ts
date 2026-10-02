import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { suggestAddresses, yandexSuggestEnabled } from '@/lib/yandexSuggest';

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

// Адреса ЭТОГО заказчика (Максим, 02.10) — повторяются по клиентам, поэтому
// в подсказках идут раньше общих по компании. Тот же RPC, что у мобильного
// приложения: supabase/migrations/0031, client_recent_addresses. Выключен,
// пока клиент не выбран.
export function useClientRecentAddresses(clientId: string | null) {
  return useQuery({
    queryKey: ['frequent-addresses', 'client', clientId],
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

// Живые подсказки Яндекса (Geosuggest) по введённому тексту. Без ключа или
// при коротком запросе не ходит в сеть вовсе.
export function useYandexAddressSuggest(query: string) {
  const text = query.trim();
  return useQuery({
    queryKey: ['yandex-suggest', text],
    enabled: yandexSuggestEnabled() && text.length >= 3,
    queryFn: () => suggestAddresses(text),
    staleTime: 60 * 60 * 1000,
  });
}
