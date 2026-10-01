import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSession } from '../providers/SessionProvider';

// Живые обновления без перезагрузки (Максим, «Правки 4», п.5): вместо
// ожидания опроса раз в минуту (orders.ts/notifications.ts, который
// остаётся как подстраховка на случай обрыва сокета) подписываемся на
// Realtime (публикация — миграция 0026) и инвалидируем те же ключи
// react-query, которыми уже пользуются обычные мутации — экран подтянет
// свежие данные тем же путём, что и после своего собственного действия, с
// учётом RLS. Один канал на всё приложение, подключается только здесь —
// отдельные экраны своих подписок не открывают, чтобы не плодить сокеты.
export function useRealtimeSync() {
  const queryClient = useQueryClient();
  const { session, employee } = useSession();
  const companyId = employee?.company_id ?? null;
  const employeeId = employee?.id ?? null;

  useEffect(() => {
    if (!session || !companyId || !employeeId) return;

    const invalidateOrders = () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['busy-employees'] });
    };
    const invalidateReports = () => {
      queryClient.invalidateQueries({ queryKey: ['driver-report'] });
      queryClient.invalidateQueries({ queryKey: ['driver-report-feed'] });
      queryClient.invalidateQueries({ queryKey: ['driver-report-drivers'] });
    };

    const channel = supabase
      .channel(`company-${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `company_id=eq.${companyId}` },
        invalidateOrders
      )
      // order_crew (подтверждение «принял» заказ) — без company_id, фильтра
      // по компании у Realtime для неё нет; доставку ограничивает RLS.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_crew' }, invalidateOrders)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_reports', filter: `company_id=eq.${companyId}` },
        invalidateReports
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `employee_id=eq.${employeeId}` },
        () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, companyId, employeeId, queryClient]);
}
