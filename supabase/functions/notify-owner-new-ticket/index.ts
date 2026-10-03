// Пуш владельцу сервиса о новом обращении в техподдержку. Не вызывается
// из приложения — её дёргает триггер support_tickets_notify_owner
// (миграция 0013) через pg_net сразу при создании тикета, с любой
// стороны (мобильное приложение или веб-кабинет), поэтому без
// пользовательского JWT, под service role — как и send-crew-reminders.
//
// Деплой: на своём сервере — deploy/selfhost/update.sh (функции копирует
// сам, снаружи сервера эта функция закрыта). В облачном Supabase — как
// раньше, обязательно с --no-verify-jwt, иначе триггер получит 401:
//   supabase functions deploy notify-owner-new-ticket --no-verify-jwt

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

  const ticketId = body.ticket_id ? String(body.ticket_id) : '';
  if (!ticketId) return new Response(JSON.stringify({ error: 'Не указан тикет' }), { status: 400, headers });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: ticket } = await admin.from('support_tickets').select('id').eq('id', ticketId).maybeSingle();
  if (!ticket) return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers });

  const { data: owners } = await admin.from('employees').select('expo_push_token').eq('role', 'owner');
  const tokens = (owners ?? [])
    .map((o) => o.expo_push_token as string | null)
    .filter((t): t is string => Boolean(t));

  // Без названия компании и темы: текст пуша проходит через серверы Expo,
  // Apple и Google за пределами России, а в теме (и в названии ИП) могут
  // быть персональные данные — по 152-ФЗ им место на своём сервере.
  await sendExpoPush(tokens, 'Новое обращение в поддержку', 'Прочитать его можно в кабинете владельца.', { ticketId });

  return new Response(JSON.stringify({ sent: tokens.length }), { status: 200, headers });
});
