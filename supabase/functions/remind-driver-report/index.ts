// Напоминание водителю в 21:00 заполнить отчёт за день, если он этого ещё
// не сделал (раздел «Зарплата и отчёты водителей», 2026-09-25). Не
// вызывается из приложения — раз в день в 21:00 по Москве её дёргает
// pg_cron (миграция 0014, задание remind-driver-report), поэтому функция
// без пользовательского JWT и работает под service role — как и
// send-crew-reminders.
//
// Кому напомнить, считает база: driver_report_reminder_tokens (миграция
// 0020) — водители с неотменённым заказом сегодня (по Москве), у которых
// отчёт за сегодня не отправлен. Раньше функция собирала это тремя
// запросами через API: список водителей упирался в лимит 1000 строк, а
// все токены уходили в Expo одним запросом, который Expo при числе
// больше 100 отвергает целиком.
//
// Деплой: на своём сервере — deploy/selfhost/update.sh (функции копирует
// сам, снаружи сервера эта функция закрыта). В облачном Supabase — как
// раньше, обязательно с --no-verify-jwt:
//   supabase functions deploy remind-driver-report --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendExpoPush } from '../_shared/expoPush.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const headers = { 'Content-Type': 'application/json' };

  const { data, error } = await admin.rpc('driver_report_reminder_tokens', {});
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
  const tokens = (data ?? []) as string[];

  const sent = await sendExpoPush(tokens, 'Отчёт за день', 'Не забудьте заполнить отчёт за сегодня и сдать кассу.');

  return new Response(JSON.stringify({ drivers: tokens.length, sent }), { status: 200, headers });
});
