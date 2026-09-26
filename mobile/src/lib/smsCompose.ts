import { Linking, Platform } from 'react-native';

// Смс клиенту теперь не уходит сама с сервера (раньше — Edge Function
// send-order-sms + sms.ru, отменено по решению Максима 2026-09-26: гейтвей
// не нужен, диспетчер отправляет смс со своего же телефона). Вместо этого
// приложение открывает системный экран отправки смс с уже подставленным
// номером и текстом — отправляет сам диспетчер нажатием кнопки в нативном
// приложении. Плейсхолдеры и форматирование — один в один со старой
// server-side логикой (сверено при переносе), чтобы шаблоны в Настройках
// продолжали работать так же, как раньше.

const MOSCOW_TZ = 'Europe/Moscow';

export function fillSmsTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\[(\w+)\]/g, (match, key: string) => (key in vars ? vars[key] : match));
}

export function buildNewOrderSmsText(
  template: string,
  vars: { clientName: string; scheduledStart: Date; price: number | null; pickupAddress: string }
): string {
  return fillSmsTemplate(template, {
    Name: vars.clientName,
    Day: new Intl.DateTimeFormat('ru-RU', { weekday: 'long', timeZone: MOSCOW_TZ }).format(vars.scheduledStart),
    Date: new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', timeZone: MOSCOW_TZ }).format(
      vars.scheduledStart
    ),
    Time: new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: MOSCOW_TZ,
    }).format(vars.scheduledStart),
    Cost: vars.price ? `${vars.price} ₽` : '',
    Address: vars.pickupAddress,
  });
}

// Российский номер к +7XXXXXXXXXX для sms: URI — с карточки клиента номер
// мог прийти с 8, пробелами, скобками (formatPhone) или уже нормализованным.
function normalizePhoneForSms(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
  if (digits.length === 10) return `+7${digits}`;
  return null;
}

// iOS и Android расходятся в разделителе перед body в sms: URI (устоявшаяся
// платформенная особенность, не опечатка): iOS — `&`, Android — `?`.
export async function openSmsComposer(phone: string, text: string): Promise<boolean> {
  const normalized = normalizePhoneForSms(phone);
  if (!normalized) return false;
  const separator = Platform.OS === 'ios' ? '&' : '?';
  const url = `sms:${normalized}${separator}body=${encodeURIComponent(text)}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch (err) {
    console.warn('Не удалось открыть экран смс', err);
    return false;
  }
}
