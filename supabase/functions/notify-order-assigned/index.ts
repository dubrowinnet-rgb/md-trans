// Пуш исполнителю, которого назначили на заказ (новый заказ или замена в
// уже существующем) — Правки 6, п.5: раньше это слали напрямую с клиента
// (useCreateOrder/useUpdateOrderCrew, мобильное приложение), веб-кабинет
// push вообще не отправлял — отсюда «нет пуша при замене грузчика», если
// правку делали из веб-кабинета. Теперь это триггер notify_order_assigned
// (миграция 0029) через pg_net сразу после вставки строки в order_crew,
// с любой стороны, поэтому без пользовательского JWT, под service role —
// как и notify-order-changed.
//
// Деплой: на своём сервере — deploy/selfhost/update.sh (функции копирует
// сам, снаружи сервера эта функция закрыта). В облачном Supabase — как
// раньше, обязательно с --no-verify-jwt, иначе триггер получит 401:
//   supabase functions deploy notify-order-assigned --no-verify-jwt

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

  const employeeId = body.employee_id ? String(body.employee_id) : '';
  const orderId = body.order_id ? String(body.order_id) : '';
  if (!employeeId || !orderId) return new Response(JSON.stringify({ error: 'Не указан сотрудник или заказ' }), { status: 400, headers });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const [{ data: order }, { data: employee }] = await Promise.all([
    admin.from('orders').select('scheduled_start').eq('id', orderId).maybeSingle(),
    admin.from('employees').select('expo_push_token').eq('id', employeeId).maybeSingle(),
  ]);
  if (!order || !employee?.expo_push_token) return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers });

  // Только дата и время, без адреса и клиента — те же причины 152-ФЗ, что
  // и в notify-order-changed: подробности видны, открыв заказ в приложении.
  const start = new Date(order.scheduled_start as string);
  const date = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Moscow' }).format(start);
  const time = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Moscow',
  }).format(start);

  await sendExpoPush([employee.expo_push_token as string], 'Новый заказ', `Вам назначен заказ на ${date} в ${time}`, { orderId });

  return new Response(JSON.stringify({ sent: 1 }), { status: 200, headers });
});
