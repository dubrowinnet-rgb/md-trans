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

// Бейдж на значке меню и приложения — просто количество непрочитанных из
// того же запроса (react-query отдаёт один и тот же кеш всем подписчикам).
export function useUnreadNotificationsCount() {
  const { data } = useNotifications();
  return data?.filter((n) => !n.read_at).length ?? 0;
}

const REPORT_KINDS: NotificationKind[] = ['report_approved', 'report_rejected', 'report_reopened'];
const SUPPORT_KINDS: NotificationKind[] = ['support_reply'];

// Цифры по разделам бокового меню (Максим, 01.10, «Правки 5», п.9: «мои
// отчеты 1, служба поддержки 1, уведомления 3 ... на гамбургере и иконке
// приложения эти цифры суммируются»). «Уведомления» — всё остальное
// (назначение/изменение/отмена заказа): раздела под них отдельного в меню
// нет, это и есть сам экран «Уведомления». total — та же сумма, что и
// useUnreadNotificationsCount (один и тот же непрочитанный набор, просто
// разложенный по разделам), не пересекаются, поэтому сумма по строкам и есть
// общий бейдж.
export function useUnreadNotificationCounts() {
  const { data } = useNotifications();
  const unread = data?.filter((n) => !n.read_at) ?? [];
  const reports = unread.filter((n) => REPORT_KINDS.includes(n.kind)).length;
  const support = unread.filter((n) => SUPPORT_KINDS.includes(n.kind)).length;
  return { orders: unread.length - reports - support, reports, support, total: unread.length };
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

// Точечная отметка прочитанным по тому, что открыли из всплывающего push
// (Максим, 01.10, «Правки 5», п.9: «если пользователь нажал и перешёл по
// всплывающей шторке уведомления, оно в непрочитанные не заносится») — в
// отличие от useMarkAllNotificationsRead (вся лента разом при открытии
// экрана), здесь гасится только то уведомление, что действительно открыли,
// по его order_id/driver_report_id: у самого push нет id конкретной строки
// notifications (один push уходит сразу всем исполнителям, см.
// notify-order-changed/index.ts), а order_id/driver_report_id уже есть в
// data и этого достаточно — RLS сам ограничивает обновление своими же
// записями. См. hooks/useNotificationTapNavigation.ts.
export function useMarkNotificationsReadFor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (target: { orderId?: string; driverReportId?: string }) => {
      let query = supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
      if (target.orderId) query = query.eq('order_id', target.orderId);
      else if (target.driverReportId) query = query.eq('driver_report_id', target.driverReportId);
      else return;
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
