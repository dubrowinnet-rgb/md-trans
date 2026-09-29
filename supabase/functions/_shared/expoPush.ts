// Отправка push через Expo Push API пачками по 100 сообщений: больше Expo
// за один запрос не принимает и отвечает ошибкой на весь запрос — тогда
// напоминание не дошло бы никому. Пачки уходят по очереди; если одна не
// ушла (сеть, ошибка Expo), остальные всё равно отправляются.
//
// Общий код функций лежит в папке с подчёркиванием: Supabase CLI сам
// подкладывает его при `supabase functions deploy <имя>`, на своём сервере
// deploy/selfhost копирует папку вместе с функциями.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;

export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// Возвращает, сколько сообщений Expo принял.
export async function sendExpoMessages(messages: ExpoMessage[]): Promise<number> {
  let accepted = 0;
  for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
    const batch = messages.slice(i, i + EXPO_BATCH_SIZE).map((m) => ({ ...m, sound: 'default' as const }));
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });
      if (res.ok) accepted += batch.length;
    } catch {
      // следующая пачка
    }
  }
  return accepted;
}

// Одно и то же сообщение многим получателям.
export function sendExpoPush(tokens: string[], title: string, body: string, data?: Record<string, unknown>) {
  return sendExpoMessages(tokens.map((to) => ({ to, title, body, data })));
}
