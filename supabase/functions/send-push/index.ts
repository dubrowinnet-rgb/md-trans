// Push-уведомления бригаде из веб-кабинета (web/src/lib/push.ts).
//
// Мобильное приложение шлёт push напрямую в Expo Push API, но из браузера
// так нельзя: Expo не отвечает на запросы с других сайтов (CORS). Поэтому
// кабинет зовёт эту функцию, а она уже с сервера отправляет в Expo.
// Push-токены сотрудников функция находит сама по их id — наружу токены
// не отдаются.
//
// Деплой (после `supabase link`, см. supabase/README.md):
//   supabase functions deploy send-push

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function reply(status: number, body: unknown, headers: HeadersInit) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reply(405, { error: 'Метод не поддерживается' }, headers);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return reply(401, { error: 'Не авторизован' }, headers);
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) return reply(401, { error: 'Не авторизован' }, headers);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  // Слать push может тот, кто может назначать бригаду, — те же права, что
  // и на создание заказа (has_order_permission в миграции 0005).
  const { data: caller } = await admin
    .from('employees')
    .select('role, can_manage_orders')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();
  if (!caller || (caller.role !== 'admin' && !caller.can_manage_orders)) {
    return reply(403, { error: 'Недостаточно прав' }, headers);
  }

  let body: { employee_ids?: unknown; title?: unknown; body?: unknown; data?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Некорректный запрос' }, headers);
  }
  const ids = Array.isArray(body.employee_ids) ? body.employee_ids.map(String).slice(0, 50) : [];
  const title = String(body.title ?? '').slice(0, 100);
  const text = String(body.body ?? '').slice(0, 300);
  if (ids.length === 0 || !title) return reply(400, { error: 'Некому или нечего отправлять' }, headers);

  const { data: employees, error } = await admin.from('employees').select('expo_push_token').in('id', ids);
  if (error) return reply(500, { error: error.message }, headers);
  const tokens = (employees ?? []).map((e) => e.expo_push_token).filter((t): t is string => Boolean(t));
  if (tokens.length === 0) return reply(200, { sent: 0 }, headers);

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(tokens.map((to) => ({ to, title, body: text, data: body.data ?? {}, sound: 'default' }))),
  });
  return reply(res.ok ? 200 : 502, { sent: res.ok ? tokens.length : 0 }, headers);
});
