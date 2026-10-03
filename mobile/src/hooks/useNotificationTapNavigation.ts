import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useMarkNotificationsReadFor } from '../api/notifications';

// Открыли приложение через всплывающую push-шторку (Максим, 01.10, «Правки
// 5», п.9) — ведём сразу на нужный экран и гасим именно то уведомление,
// а не только после отдельного захода в ленту (см. комментарий у
// useMarkNotificationsReadFor). data у push — то, что реально кладут
// отправители (lib/pushNotifications.ts/sendPushNotifications и
// notify-order-changed/index.ts): orderId у всех заказных push, либо
// {kind: 'driver-report', reportId} у «отчёт не согласован» (api/driverReports.ts).
// У «Ответ в поддержке» и «Отчёт согласован» push вообще нет (только лента,
// см. миграции 0024/0025) — тут обрабатывать нечего.
export function useNotificationTapNavigation() {
  const markRead = useMarkNotificationsReadFor();

  useEffect(() => {
    function handle(response: Notifications.NotificationResponse) {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      if (!data) return;
      if (data.orderId) {
        const orderId = String(data.orderId);
        markRead.mutate({ orderId });
        router.push(`/order/${orderId}`);
      } else if (data.kind === 'driver-report' && data.reportId) {
        markRead.mutate({ driverReportId: String(data.reportId) });
        router.push('/settings/driver-feed');
      }
    }

    // Нажатие, пока приложение уже запущено (в фоне/на экране блокировки).
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    // Запуск приложения самим нажатием на push (было закрыто) — тот же
    // разбор для ответа, которым нас запустили.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handle(response);
    });

    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
