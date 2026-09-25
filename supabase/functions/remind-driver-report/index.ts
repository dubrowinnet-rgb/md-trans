// Напоминание водителю в 21:00 заполнить отчёт за день, если он этого ещё
// не сделал (раздел «Зарплата и отчёты водителей», 2026-09-25). Не
// вызывается из приложения — раз в день в 21:00 по Москве её дёргает
// pg_cron (миграция 0014, задание remind-driver-report), поэтому функция
// без пользовательского JWT и работает под service role — как и
// send-crew-reminders.
//
// Деплой (после `supabase link`, см. supabase/README.md) — обязательно
// с флагом --no-verify-jwt:
//   supabase functions deploy remind-driver-report --no-verify-jwt

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

// «Сегодня» по московскому времени — тем же способом, что и send-crew-reminders
// показывает время (Europe/Moscow), чтобы граница дня не съезжала от UTC
// сервера. report_date у driver_reports — обычная date, без времени/зоны.
function moscowTodayDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

Deno.serve(async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const headers = { 'Content-Type': 'application/json' };
  const today = moscowTodayDate();
  const dayStart = `${today}T00:00:00+03:00`;
  const dayEnd = `${today}T23:59:59+03:00`;

  // Водители, у которых сегодня был хотя бы один заказ в бригаде.
  const { data: crewRows } = await admin
    .from('order_crew')
    .select('employee_id, orders!inner(scheduled_start)')
    .eq('role', 'driver')
    .gte('orders.scheduled_start', dayStart)
    .lte('orders.scheduled_start', dayEnd);

  const driverIds = [...new Set((crewRows ?? []).map((r) => r.employee_id as string))];
  if (driverIds.length === 0) return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers });

  // Кто уже отправил (submitted/confirmed) отчёт за сегодня — тем не напоминаем.
  const { data: doneReports } = await admin
    .from('driver_reports')
    .select('employee_id')
    .eq('report_date', today)
    .in('status', ['submitted', 'confirmed'])
    .in('employee_id', driverIds);
  const done = new Set((doneReports ?? []).map((r) => r.employee_id as string));

  const pending = driverIds.filter((id) => !done.has(id));
  if (pending.length === 0) return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers });

  const { data: employees } = await admin.from('employees').select('id, expo_push_token').in('id', pending);
  const tokens = (employees ?? [])
    .map((e) => e.expo_push_token as string | null)
    .filter((t): t is string => Boolean(t));

  await sendExpoPush(tokens, 'Отчёт за день', 'Не забудьте заполнить отчёт за сегодня и сдать кассу.');

  return new Response(JSON.stringify({ sent: tokens.length }), { status: 200, headers });
});
