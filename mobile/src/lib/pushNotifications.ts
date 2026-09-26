import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Регистрирует устройство сотрудника для push и сохраняет токен в его
// строку employees (раздел 9.5 — уведомление о новом заказе). Без EAS
// projectId (см. mobile/README.md) push-токен получить нельзя — в этом
// случае просто выходим, ничего не ломая: приложение продолжает работать,
// только без push.
export async function registerForPushNotifications(employeeId: string) {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let status = existingStatus;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn(
        'Нет EAS projectId в app.json (extra.eas.projectId) — push-токен не запрошен. См. mobile/README.md.'
      );
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    await supabase.from('employees').update({ expo_push_token: token }).eq('id', employeeId);
  } catch (err) {
    console.warn('Не удалось зарегистрировать push-токен', err);
  }
}

// Отправка через Expo Push API напрямую с клиента — best-effort,
// осознанное упрощение для MVP-среза: доставка не гарантируется (нет
// сервера/очереди с повтором), но для одиночного уведомления диспетчера
// этого достаточно, а собственный backend пока не создавался.
export async function sendPushNotifications(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  if (tokens.length === 0) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        tokens.map((to) => ({ to, title, body, data, sound: 'default' as const }))
      ),
    });
  } catch (err) {
    console.warn('Не удалось отправить push-уведомления', err);
  }
}
