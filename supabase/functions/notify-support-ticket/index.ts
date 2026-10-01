// Пуш администратору/диспетчеру компании о новом обращении сотрудника в
// «Службу поддержки» (Максим, 01.10, вторая половина отложенного пункта
// «Правки 3» п.5). Не вызывается из приложения — дёргает триггер
// employee_support_tickets_notify (миграция 0025) через
// private.call_edge_function сразу при создании тикета, поэтому без
// пользовательского JWT, под service role — как notify-owner-new-ticket
// и notify-order-changed.
//
// Деплой: на своём сервере — deploy/selfhost/update.sh (функции копирует
// сам, снаружи сервера эта функция закрыта). В облачном Supabase — как и
// остальные триггерные функции, обязательно с --no-verify-jwt:
//   supabase functions deploy notify-support-ticket --no-verify-jwt

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
  if (!ticketId) return new Response(JSON.stringify({ error: 'Не указано обращение' }), { status: 400, headers });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: ticket } = await admin
    .from('employee_support_tickets')
    .select('company_id')
    .eq('id', ticketId)
    .maybeSingle();
  if (!ticket) return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers });

  const { data: recipients } = await admin
    .from('employees')
    .select('expo_push_token')
    .eq('company_id', ticket.company_id)
    .in('role', ['admin', 'dispatcher']);
  const tokens = (recipients ?? [])
    .map((e) => e.expo_push_token as string | null)
    .filter((t): t is string => Boolean(t));

  // Без темы обращения: текст пуша проходит через серверы Expo, Apple и
  // Google за пределами России, а в теме сотрудник мог написать что угодно,
  // включая персональные данные — по 152-ФЗ им место только на своём
  // сервере (та же логика, что в notify-owner-new-ticket).
  await sendExpoPush(tokens, 'Новое обращение в поддержку', 'Сотрудник написал в поддержку — откройте приложение.', {
    ticketId,
  });

  return new Response(JSON.stringify({ sent: tokens.length }), { status: 200, headers });
});
