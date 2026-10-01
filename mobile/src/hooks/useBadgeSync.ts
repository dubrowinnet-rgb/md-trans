import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useUnreadNotificationsCount } from '../api/notifications';

// Цифра на значке приложения рядом с иконкой (Максим, 01.10) — один
// источник правды: столько же, сколько непрочитанных в ленте уведомлений
// (api/notifications.ts), а не инкремент по каждому полученному push.
// Значение подтягивается сразу при входе, после каждого опроса раз в
// минуту, после живого обновления (useRealtimeSync инвалидирует ['notifications']
// при новой записи) и падает до нуля при открытии экрана ленты (она сама
// помечает всё прочитанным) и при выходе из аккаунта — useNotifications
// отключает запрос без сессии, и unread вернётся в 0.
//
// Поддержка самой цифры на значке — особенность лаунчера/ОС, а не
// приложения: на iPhone и большинстве Android работает, на части
// Android-прошивок система эту цифру просто не показывает — тогда
// непрочитанные всё равно видны по бейджу в самом приложении (экран
// «Уведомления», как и раньше).
export function useBadgeSync() {
  const unread = useUnreadNotificationsCount();

  useEffect(() => {
    Notifications.setBadgeCountAsync(unread).catch(() => {});
  }, [unread]);
}
