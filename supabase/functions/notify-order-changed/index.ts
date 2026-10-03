// Пуш всем исполнителям заказа при его изменении или отмене (доработки 2,
// п.3). Не вызывается из приложения — её дёргает триггер
// orders_notify_changed (миграция 0015) через pg_net сразу после
// изменения строки в orders, с любой стороны (мобильное приложение или
// веб-кабинет), поэтому без пользовательского JWT, под service role —
// как и notify-owner-new-ticket.
//
// Деплой: на своём сервере — deploy/selfhost/update.sh (функции копирует
// сам, снаружи сервера эта функция закрыта). В облачном Supabase — как
// раньше, обязательно с --no-verify-jwt, иначе триггер получит 401:
//   supabase functions deploy notify-order-changed --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function sendExpoPush(tokens: string[], title: string, msgBody: string, data?: Record<string, unknown>) {
  if (tokens.length === 0) return;
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(tokens.map((to) => ({ to, title, body: msgBody, data, sound: 'default' as const }))),
  }).catch(() => {});
}

Deno.serve(async (req) => {
  const headers = { 'Content-Type': 'application/json' };

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Некорректный запрос' }), { status: 400, headers });
  }

  const orderId = body.order_id ? String(body.order_id) : '';
  if (!orderId) return new Response(JSON.stringify({ error: 'Не указан заказ' }), { status: 400, headers });
  const cancelled = Boolean(body.cancelled);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: order } = await admin
    .from('orders')
    .select('scheduled_start, order_crew(employee_id)')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers });

  const crew = (order.order_crew as unknown as { employee_id: string }[]) ?? [];
  // Только дата и время, без адреса и клиента: текст пуша проходит через
  // серверы Expo, Apple и Google за пределами России, а персональные данные
  // по 152-ФЗ должны оставаться на своём сервере. Подробности сотрудник
  // видит, открыв заказ в приложении.
  const start = new Date(order.scheduled_start as string);
  const date = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Moscow' }).format(start);
  const time = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Moscow',
  }).format(start);

  const employeeIds = [...new Set(crew.map((c) => c.employee_id))];
  if (employeeIds.length === 0) return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers });

  const { data: employees } = await admin.from('employees').select('expo_push_token').in('id', employeeIds);
  const tokens = (employees ?? [])
    .map((e) => e.expo_push_token as string | null)
    .filter((t): t is string => Boolean(t));

  const title = cancelled ? 'Заказ отменён' : 'Изменения в заказе';
  const msgBody = cancelled
    ? `Заказ на ${date} в ${time} отменён`
    : `Заказ на ${date} в ${time}: обновлена информация`;
  await sendExpoPush(tokens, title, msgBody, { orderId });

  return new Response(JSON.stringify({ sent: tokens.length }), { status: 200, headers });
});
