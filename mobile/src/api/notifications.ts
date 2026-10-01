import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSession } from '../providers/SessionProvider';
import type { NotificationKind } from '../types/database';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  order_id: string | null;
  driver_report_id: string | null;
  support_ticket_id: string | null;
  read_at: string | null;
  created_at: string;
}

const NOTIFICATIONS_LIMIT = 100;

// Лента уведомлений сотрудника (Максим, 30.09, «Правки 3», п.5, подтвердил
// делать вечером того же дня): заполняется сервером (миграция 0024) —
// изменение/отмена заказа, согласование или несогласование отчёта. RLS
// отдаёт только свои записи; вставить уведомление с телефона нельзя —
// только функции в базе (триггер и approve/reject_driver_report).
export function useNotifications() {
  const { session } = useSession();
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, kind, title, body, order_id, driver_report_id, support_ticket_id, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(NOTIFICATIONS_LIMIT);
      if (error) throw error;
      return data ?? [];
    },
    // До входа запрос не нужен (RLS всё равно ничего не отдаст без сессии) —
    // это же позволяет безопасно держать useUnreadNotificationsCount
    // смонтированным в корне приложения (см. useBadgeSync) ещё до логина.
    enabled: !!session,
    // Та же частота, что у автосинхронизации заказов (mobile/src/api/orders.ts) —
    // бейдж в меню обновляется сам, пока экран открыт.
    refetchInterval: 60_000,
  });
}

// Бейдж на значке меню — просто количество непрочитанных из того же
// запроса (react-query отдаёт один и тот же кеш всем подписчикам).
export function useUnreadNotificationsCount() {
  const { data } = useNotifications();
  return data?.filter((n) => !n.read_at).length ?? 0;
}

// Отмечает всю ленту прочитанной разом — экран ленты вызывает при открытии,
// как колокольчик администратора (NotificationBell): бейдж пропадает, когда
// список посмотрели, а не по каждой записи отдельно.
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
