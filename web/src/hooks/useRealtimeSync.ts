'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { invalidateOrders } from '@/api/orders';
import { useCompanyId, useSession } from '@/providers/SessionProvider';

// Правки 4, п.5 (01.10): раньше заказы, бригады и отчёты водителей
// обновлялись в кабинете только при переоткрытии страницы — обычный React
// Query без вотчера не узнаёт о чужих правках. Подписка на Supabase
// Realtime (миграция 0026 от mobile, та же supabase_realtime publication,
// что и в мобильном приложении — см. mobile/src/hooks/useRealtimeSync.ts)
// добивает их сразу.
//
// Один канал с тремя таблицами:
// - orders — сами заказы, отфильтровано по компании;
// - order_crew — статус «принял заказ» и назначение бригады; своей
//   company_id у таблицы нет, фильтрует RLS на стороне базы. Эти строки
//   входят в тот же запрос ORDER_SELECT, что и сами заказы (вложенный
//   join), поэтому инвалидируем те же ключи, что и для orders.
// - driver_reports — отправка/правка/согласование отчёта.
// Таблицу notifications (личная лента, миграция 0024) НЕ слушаем — в вебе
// пока нет экрана, который её показывает (см. memory web-mobile-responsive
// про тот же разрыв с 0025); подписываться было бы не на что.
//
// Существующий поллинг (staleTime 60с + refetchOnWindowFocus в
// providers.tsx) остаётся как запасной вариант — как и в мобильном.
export function useRealtimeSync() {
  const queryClient = useQueryClient();
  const companyId = useCompanyId();
  const { employee } = useSession();

  useEffect(() => {
    if (!companyId || !employee) return;

    const channel = supabase
      .channel(`cabinet-sync-${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `company_id=eq.${companyId}` },
        () => invalidateOrders(queryClient)
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_crew' }, () =>
        invalidateOrders(queryClient)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_reports', filter: `company_id=eq.${companyId}` },
        () => queryClient.invalidateQueries({ queryKey: ['driver-reports'] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, employee, queryClient]);
}
