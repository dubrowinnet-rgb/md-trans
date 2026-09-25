// Пуш владельцу сервиса о новом обращении в техподдержку. Не вызывается
// из приложения — её дёргает триггер support_tickets_notify_owner
// (миграция 0013) через pg_net сразу при создании тикета, с любой
// стороны (мобильное приложение или веб-кабинет), поэтому без
// пользовательского JWT, под service role — как и send-crew-reminders.
//
// Деплой (после `supabase link`, см. supabase/README.md) — обязательно
// с флагом --no-verify-jwt, иначе триггер получит 401:
//   supabase functions deploy notify-owner-new-ticket --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

  const { data: ticket } = await admin
    .from('support_tickets')
    .select('subject, companies(name)')
    .eq('id', ticketId)
    .maybeSingle();
  if (!ticket) return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers });

  const { data: owners } = await admin.from('employees').select('expo_push_token').eq('role', 'owner');
  const tokens = (owners ?? [])
    .map((o) => o.expo_push_token as string | null)
    .filter((t): t is string => Boolean(t));

  const companyName = (ticket.companies as unknown as { name: string } | null)?.name ?? '—';
  await sendExpoPush(tokens, 'Новое обращение в поддержку', `${companyName}: ${ticket.subject}`, { ticketId });

  return new Response(JSON.stringify({ sent: tokens.length }), { status: 200, headers });
});
