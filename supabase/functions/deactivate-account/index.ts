// Деактивация / восстановление доступа сотрудника — «Уволить» /
// «Восстановить доступ» на карточке (веб: AccountModal, моб.: AccountDialog).
// Максим, 2026-09-29 (веб-тред, п.1 списка): «добавить кнопку удалить
// профиль сотрудника». Полностью удалить нельзя: на employees.id без
// каскада ссылаются его прошлые заказы (order_crew, orders.created_by),
// отчёты водителя, начисления, обращения в поддержку — DELETE упал бы по
// внешнему ключу, как только у сотрудника есть хоть одна такая строка.
//
// Вместо новой колонки — уже существующая employees.account_status
// (миграция 0001: 'active' | 'pending_payment' | 'suspended', заведена, но
// раньше нигде не проверялась) + блокировка входа через auth.admin
// (ban_duration), той же service-role техникой, что и update-account.
// Первую версию этой функции сделал мобильный тред отдельной колонкой
// employees.deleted_at — веб-тред параллельно и независимо решил ту же
// задачу через account_status и уже выкатил на неё UI (веб-кабинет,
// «Команда»), так что деактивация выиграла: см. миграцию
// 0022_employee_deactivate_reconcile.sql.
//
// Тело запроса: { id: string, active: boolean }. active:false — уволить
// (бан + 'suspended'); active:true — восстановить (разбан + 'active').
// Тот же admin/owner-only доступ, что и update-account: владелец сервиса
// (любая компания, для поддержки) или администратор своей же компании.
// Уволить самого себя нельзя — не self-service, а чтобы админ не запер
// сам себя случайным кликом (то же самое ещё раз проверяет и триггер БД
// при прямом PATCH, см. 0022, это — основной путь и понятное сообщение).
// Нельзя уволить последнего администратора компании — иначе некому будет
// управлять командой дальше.
//
// Деплой: на своём сервере — deploy/selfhost/update.sh, в облачном Supabase
// (после `supabase link`, см. supabase/README.md):
//   supabase functions deploy deactivate-account

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// ~100 лет — Supabase Admin API просит длительность, а не «навсегда».
const BAN_FOREVER = '876000h';
const UNBAN = 'none';

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
  const active = Boolean(body.active);

  const { data: target } = await admin.from('employees').select('*').eq('id', id).maybeSingle();
  if (!target) return fail(404, 'Сотрудник не найден', headers);

  const canManage = caller.role === 'owner' || (caller.role === 'admin' && target.company_id === caller.company_id);
  if (!canManage) {
    return fail(403, 'Менять доступ другого сотрудника может только администратор его компании', headers);
  }

  if (!active) {
    if (caller.id === id) {
      return fail(400, 'Нельзя уволить самого себя — попросите другого администратора', headers);
    }
    // Не даём компании остаться совсем без администратора.
    if (target.role === 'admin') {
      const { count } = await admin
        .from('employees')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', target.company_id)
        .eq('role', 'admin')
        .neq('account_status', 'suspended');
      if ((count ?? 0) <= 1) {
        return fail(400, 'Нельзя уволить последнего администратора компании', headers);
      }
    }
  }

  let banWarning: string | null = null;
  if (target.auth_user_id) {
    const { error: banError } = await admin.auth.admin.updateUserById(target.auth_user_id, {
      ban_duration: active ? UNBAN : BAN_FOREVER,
    });
    // Не фатально для самой деактивации (аккаунт уже помечен/скрыт из
    // выбора экипажа) — но не прячем молча: без этого предупреждения
    // «уволенный» сотрудник может остаться способным войти, как раньше
    // молча оставался незаметный конфликт телефона в update-account.
    if (banError) {
      banWarning = active
        ? `Статус обновлён, но вход пока не восстановлен: ${banError.message}`
        : `Статус обновлён, но вход не заблокирован: ${banError.message}`;
    }
  }

  const { data: employee, error: updateError } = await admin
    .from('employees')
    .update({ account_status: active ? 'active' : 'suspended' })
    .eq('id', id)
    .select()
    .single();

  if (updateError) return fail(400, updateError.message, headers);

  return new Response(JSON.stringify({ employee, ...(banWarning ? { ban_warning: banWarning } : {}) }), {
    status: 200,
    headers,
  });
});
