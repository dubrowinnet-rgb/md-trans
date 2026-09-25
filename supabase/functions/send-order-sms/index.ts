// Автосмс клиенту при создании заказа (доработки 1, п.0). Вызывается с
// мобильного/веб сразу после успешного create_order — по тому же
// принципу «best-effort с клиента», что и push-уведомления
// (mobile/src/lib/pushNotifications.ts): не отправилось — заказ всё
// равно создан, диспетчер не должен застрять из-за смс-провайдера.
//
// Провайдер — sms.ru (простой GET-запрос, один ключ). Ключ хранится как
// секрет функции, а не в таблице, поэтому пока он не задан, функция
// просто ничего не отправляет и отвечает {skipped: true} — это ожидаемое
// состояние «смс ещё не подключены», а не ошибка. Задать ключ:
//   supabase secrets set SMS_RU_API_ID=<ваш api_id с sms.ru>
//
// Деплой (после `supabase link`, см. supabase/README.md):
//   supabase functions deploy send-order-sms

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SMS_RU_API_ID = Deno.env.get('SMS_RU_API_ID');

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function fail(status: number, error: string, headers: HeadersInit) {
  return new Response(JSON.stringify({ error }), { status, headers });
}

function ok(body: Record<string, unknown>, headers: HeadersInit) {
  return new Response(JSON.stringify(body), { status: 200, headers });
}

// Российский номер к виду 7XXXXXXXXXX, который принимает sms.ru — с
// клиента/из карточки клиента номер мог прийти с +, пробелами, скобками.
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith('7')) return digits;
  if (digits.length === 10) return `7${digits}`;
  return null;
}

function fillTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\[(\w+)\]/g, (match, key: string) => (key in vars ? vars[key] : match));
}

const MOSCOW_TZ = 'Europe/Moscow';

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return fail(405, 'Метод не поддерживается', headers);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Некорректный запрос', headers);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return fail(401, 'Не авторизован', headers);

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) return fail(401, 'Не авторизован', headers);

  const orderId = String(body.order_id ?? '');
  if (!orderId) return fail(400, 'Не указан заказ', headers);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: order, error: orderError } = await admin
    .from('orders')
    .select(
      'id, scheduled_start, actual_price, client_sms_sent_at, clients(name, phone), order_stops(address, type, is_primary)'
    )
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) return fail(400, orderError.message, headers);
  if (!order) return fail(404, 'Заказ не найден', headers);
  if (order.client_sms_sent_at) return ok({ skipped: true, reason: 'already_sent' }, headers);

  const client = order.clients as unknown as { name: string | null; phone: string | null } | null;
  const phone = client?.phone ? normalizePhone(client.phone) : null;
  if (!phone) return ok({ skipped: true, reason: 'no_phone' }, headers);

  if (!SMS_RU_API_ID) return ok({ skipped: true, reason: 'not_configured' }, headers);

  const { data: template } = await admin
    .from('sms_templates')
    .select('body')
    .eq('key', 'new_order')
    .maybeSingle();
  if (!template) return ok({ skipped: true, reason: 'no_template' }, headers);

  const start = new Date(order.scheduled_start as string);
  const stops = (order.order_stops as unknown as { address: string; type: string; is_primary: boolean }[]) ?? [];
  const pickup = stops.find((s) => s.is_primary && s.type === 'pickup')?.address ?? '';
  const price = order.actual_price;

  const text = fillTemplate(template.body, {
    Name: client?.name ?? '',
    Day: new Intl.DateTimeFormat('ru-RU', { weekday: 'long', timeZone: MOSCOW_TZ }).format(start),
    Date: new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', timeZone: MOSCOW_TZ }).format(start),
    Time: new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: MOSCOW_TZ }).format(
      start
    ),
    Cost: price ? `${price} ₽` : '',
    Address: pickup,
  });

  const url = new URL('https://sms.ru/sms/send');
  url.searchParams.set('api_id', SMS_RU_API_ID);
  url.searchParams.set('to', phone);
  url.searchParams.set('msg', text);
  url.searchParams.set('json', '1');

  try {
    const res = await fetch(url.toString());
    const result = await res.json();
    const sms = result?.sms?.[phone];
    if (result?.status !== 'OK' || (sms && sms.status !== 'OK')) {
      const reason = sms?.status_text || result?.status_text || 'Ошибка отправки смс';
      return ok({ skipped: true, reason: 'provider_error', detail: reason }, headers);
    }
    await admin.from('orders').update({ client_sms_sent_at: new Date().toISOString() }).eq('id', orderId);
    return ok({ sent: true }, headers);
  } catch (err) {
    return ok({ skipped: true, reason: 'network_error', detail: err instanceof Error ? err.message : String(err) }, headers);
  }
});
