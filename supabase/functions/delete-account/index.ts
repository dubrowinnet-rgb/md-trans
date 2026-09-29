// Удаление сотрудника из «Команды» (Максим, 2026-09-29, список в веб-треде,
// пункт 1: «добавить кнопку удалить профиль сотрудника на карточке со всей
// информацией о нем»). Тот же вызов с {restore: true} возвращает обратно —
// пригодится, если удалили не того (кнопки для этого в интерфейсе пока нет,
// действие только на будущее).
//
// Отдельная функция, а не прямой UPDATE employees.deleted_at (как для
// role/прав — see accounts.ts useUpdateAccount): помимо самой колонки нужно
// ещё забанить вход в Supabase Auth (auth.admin.updateUserById с
// ban_duration), а это требует service role key — по той же причине, что
// смена пароля/телефона в update-account. RLS не запрещает admin'у
// поменять deleted_at обычным PATCH напрямую (как и phone — см. комментарий
// в update-account), это лишь соглашение на уровне приложения: сама колонка
// без Auth-бана даёт рассинхрон (числится удалённым, но всё ещё может
// войти) — все родные экраны ходят только через эту функцию и
// useDeleteAccount (mobile/src/api/accounts.ts).
//
// Физического удаления строки нет и не будет: на сотрудника ссылаются его
// прошлые заказы (order_crew, orders.created_by), отчёты, зарплата — см.
// миграцию 0021_employee_delete.sql.
//
// Деплой: на своём сервере — deploy/selfhost/update.sh, в облачном Supabase
// (после `supabase link`, см. supabase/README.md):
//   supabase functions deploy delete-account

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// ~100 лет — Supabase Admin API просит длительность, а не «навсегда»;
// restore снимает бан отдельным вызовом с ban_duration: 'none'.
const BAN_DURATION = '876000h';

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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: caller } = await admin
    .from('employees')
    .select('id, role, company_id')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();
  if (!caller) return fail(403, 'Недостаточно прав', headers);

  const id = String(body.id ?? '');
  if (!id) return fail(400, 'Не указан сотрудник', headers);
  const restore = Boolean(body.restore);

  const { data: target } = await admin.from('employees').select('*').eq('id', id).maybeSingle();
  if (!target) return fail(404, 'Сотрудник не найден', headers);

  // Владелец сервиса — для поддержки, любой компании; иначе только
  // администратор той же компании (без этой проверки один админ мог бы по
  // id удалить сотрудника ДРУГОЙ компании) — та же логика, что в
  // update-account.
  const canManage = caller.role === 'owner' || (caller.role === 'admin' && target.company_id === caller.company_id);
  if (!canManage) {
    return fail(403, 'Удалять сотрудников может только администратор его компании', headers);
  }

  if (!restore) {
    if (caller.id === id) {
      return fail(400, 'Нельзя удалить самого себя — попросите другого администратора', headers);
    }
    // Не даём компании остаться совсем без администратора — иначе некому
    // будет управлять командой дальше.
    if (target.role === 'admin') {
      const { count } = await admin
        .from('employees')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', target.company_id)
        .eq('role', 'admin')
        .is('deleted_at', null);
      if ((count ?? 0) <= 1) {
        return fail(400, 'Нельзя удалить последнего администратора компании', headers);
      }
    }

    if (!target.deleted_at) {
      const { error: updateError } = await admin.from('employees').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (updateError) return fail(400, updateError.message, headers);
    }

    let banWarning: string | null = null;
    if (target.auth_user_id) {
      const { error: banError } = await admin.auth.admin.updateUserById(target.auth_user_id, {
        ban_duration: BAN_DURATION,
      });
      // Не фатально для самого удаления (профиль уже скрыт из «Команды» и
      // выбора экипажа) — но сотрудник в этом случае технически ещё может
      // войти, поэтому не прячем ошибку молча, как и phone_warning в
      // update-account.
      if (banError) {
        banWarning = `Сотрудник скрыт из «Команды», но вход не заблокирован: ${banError.message}`;
      }
    }

    return new Response(JSON.stringify({ ok: true, ...(banWarning ? { ban_warning: banWarning } : {}) }), {
      status: 200,
      headers,
    });
  }

  // restore: true — вернуть удалённого сотрудника обратно.
  if (target.deleted_at) {
    const { error: updateError } = await admin.from('employees').update({ deleted_at: null }).eq('id', id);
    if (updateError) return fail(400, updateError.message, headers);
  }

  let unbanWarning: string | null = null;
  if (target.auth_user_id) {
    const { error: unbanError } = await admin.auth.admin.updateUserById(target.auth_user_id, { ban_duration: 'none' });
    if (unbanError) {
      unbanWarning = `Сотрудник возвращён в «Команду», но вход пока не восстановлен: ${unbanError.message}`;
    }
  }

  return new Response(JSON.stringify({ ok: true, ...(unbanWarning ? { ban_warning: unbanWarning } : {}) }), {
    status: 200,
    headers,
  });
});
