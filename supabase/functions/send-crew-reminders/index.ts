// Пуш-напоминания сотрудникам о предстоящем заказе (доработки 1, п.1).
// Не вызывается из приложения — раз в 5 минут её дёргает pg_cron
// (миграция 0011, задание send-crew-reminders), поэтому функция без
// пользовательского JWT и работает под service role.
//
// Правила «за сколько минут» — таблица reminder_rules (редактируется в
// Настройках), order_reminder_log не даёт напомнить о одном и том же
// заказе по одному и тому же правилу дважды.
//
// Деплой: на своём сервере — deploy/selfhost/update.sh (функции копирует
// сам, снаружи сервера эта функция закрыта). В облачном Supabase — как
// раньше, обязательно с --no-verify-jwt, иначе pg_cron получит 401:
//   supabase functions deploy send-crew-reminders --no-verify-jwt

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

Deno.serve(async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const headers = { 'Content-Type': 'application/json' };
  const now = new Date();

  const { data: rules } = await admin
    .from('reminder_rules')
    .select('id, offset_minutes')
    .eq('target', 'crew_push')
    .eq('enabled', true);
  if (!rules || rules.length === 0) return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers });

  let sent = 0;

  for (const rule of rules) {
    // Заказы, которые начинаются в промежутке [now, now + offset] — то
    // есть ровно сейчас настало время напомнить о них по этому правилу
    // (запуск раз в 5 минут покрывает окно с запасом на пропуск тика).
    const threshold = new Date(now.getTime() + rule.offset_minutes * 60_000);
    const { data: orders } = await admin
      .from('orders')
      .select('id, scheduled_start, order_crew(employee_id)')
      .gt('scheduled_start', now.toISOString())
      .lte('scheduled_start', threshold.toISOString())
      .not('status', 'eq', 'cancelled');

    for (const order of orders ?? []) {
      const crew = (order.order_crew as unknown as { employee_id: string }[]) ?? [];
      const start = new Date(order.scheduled_start as string);
      const time = new Intl.DateTimeFormat('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Europe/Moscow',
      }).format(start);

      const employeeIds = [...new Set(crew.map((c) => c.employee_id))];
      for (const employeeId of employeeIds) {
        const { data: already } = await admin
          .from('order_reminder_log')
          .select('order_id')
          .eq('order_id', order.id)
          .eq('employee_id', employeeId)
          .eq('rule_id', rule.id)
          .maybeSingle();
        if (already) continue;

        const { data: employee } = await admin
          .from('employees')
          .select('expo_push_token')
          .eq('id', employeeId)
          .maybeSingle();
        const token = employee?.expo_push_token;

        // Лог пишем в любом случае (даже без токена) — иначе при
        // следующем запуске (через 5 минут) правило снова попадёт в окно
        // [now, now+offset] и мы будем пытаться напомнить бесконечно.
        await admin.from('order_reminder_log').insert({ order_id: order.id, employee_id: employeeId, rule_id: rule.id });

        // Без адреса: текст пуша проходит через серверы Expo, Apple и
        // Google за пределами России (152-ФЗ) — адрес сотрудник видит в
        // самом заказе в приложении.
        if (token) {
          await sendExpoPush(
            [token],
            'Скоро заказ',
            `Заказ в ${time} (через ${rule.offset_minutes} мин.)`,
            { orderId: order.id }
          );
          sent += 1;
        }
      }
    }
  }

  return new Response(JSON.stringify({ sent }), { status: 200, headers });
});
