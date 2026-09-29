// Пуш-напоминания сотрудникам о предстоящем заказе (доработки 1, п.1).
// Не вызывается из приложения — раз в 5 минут её дёргает pg_cron
// (миграция 0011, задание send-crew-reminders), поэтому функция без
// пользовательского JWT и работает под service role.
//
// Кому пора напомнить, решает база: claim_crew_reminders (миграция 0020)
// берёт правила «за сколько минут» каждой компании (reminder_rules,
// редактируются в Настройках) только для заказов этой же компании и сразу
// отмечает напоминание в order_reminder_log — одним запросом, поэтому о
// заказе по одному правилу не напомнит дважды даже при двух запусках
// подряд. Раньше функция брала правила всех компаний для заказов всех
// компаний: при N компаниях сотрудник получал N одинаковых напоминаний.
//
// Деплой: на своём сервере — deploy/selfhost/update.sh (функции копирует
// сам, снаружи сервера эта функция закрыта). В облачном Supabase — как
// раньше, обязательно с --no-verify-jwt, иначе pg_cron получит 401:
//   supabase functions deploy send-crew-reminders --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendExpoMessages } from '../_shared/expoPush.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface DueReminder {
  order_id: string;
  employee_id: string;
  offset_minutes: number;
  scheduled_start: string;
  expo_push_token: string | null;
}

const timeFormat = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Europe/Moscow',
});

Deno.serve(async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const headers = { 'Content-Type': 'application/json' };

  // Отметку в журнале база ставит и тем, у кого нет push-токена, — иначе
  // через 5 минут заказ снова попал бы в окно и попытки шли бы бесконечно.
  const { data, error } = await admin.rpc('claim_crew_reminders');
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
  const due = (data ?? []) as DueReminder[];

  // Без адреса: текст пуша проходит через серверы Expo, Apple и Google за
  // пределами России (152-ФЗ) — адрес сотрудник видит в самом заказе в
  // приложении.
  const sent = await sendExpoMessages(
    due
      .filter((d) => d.expo_push_token)
      .map((d) => ({
        to: d.expo_push_token as string,
        title: 'Скоро заказ',
        body: `Заказ в ${timeFormat.format(new Date(d.scheduled_start))} (через ${d.offset_minutes} мин.)`,
        data: { orderId: d.order_id },
      }))
  );

  return new Response(JSON.stringify({ due: due.length, sent }), { status: 200, headers });
});
