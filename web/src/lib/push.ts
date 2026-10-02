import { supabase } from './supabase';

// Push бригаде о новом или перенесённом заказе. Мобильное приложение шлёт
// их напрямую в Expo, но из браузера Expo Push API не отвечает (нет CORS),
// поэтому веб-кабинет отправляет через серверную функцию send-push
// (supabase/functions/send-push): она сама находит push-токены по id
// сотрудников. Как и в мобильном приложении — best-effort: если функция
// не задеплоена или push не дошёл, заказ всё равно сохранён.
export async function notifyEmployees(
  employeeIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  const ids = [...new Set(employeeIds)];
  if (ids.length === 0) return;
  try {
    await supabase.functions.invoke('send-push', { body: { employee_ids: ids, title, body, data } });
  } catch (err) {
    console.warn('Не удалось отправить push-уведомления', err);
  }
}
