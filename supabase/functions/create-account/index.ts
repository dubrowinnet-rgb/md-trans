// Создание аккаунта сотрудника (админ/диспетчер/водитель/грузчик) с
// логином и паролем, которые задаёт администратор.
//
// Почему это отдельная серверная функция, а не просто INSERT из
// приложения: пароль можно задать только через Supabase Admin API
// (auth.admin.createUser), а он требует service role key — секрет,
// которому нельзя оказаться в мобильном приложении (его достал бы любой
// пользователь). Edge Function — единственное место, где service role key
// используется, и наружу он не выходит: платформа сама подставляет его в
// переменную окружения SUPABASE_SERVICE_ROLE_KEY при вызове функции.
//
// Деплой (после `supabase link`, см. supabase/README.md):
//   supabase functions deploy create-account
// Больше ничего настраивать не нужно — SUPABASE_URL, SUPABASE_ANON_KEY и
// SUPABASE_SERVICE_ROLE_KEY функция получает от платформы автоматически.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const ROLES = ['admin', 'dispatcher', 'driver', 'loader'];
// Латиница/цифры и . _ - — чтобы логин было легко произнести и он точно
// превращался в валидный email (см. loginToEmail).
const LOGIN_RE = /^[a-zA-Z0-9._-]{3,32}$/;

function loginToEmail(login: string) {
  // Внутренний, никуда не отправляемый адрес: Supabase Auth требует email,
  // а мы хотим, чтобы сотрудник вводил только логин. Домен не существует и
  // не должен существовать — писем на него никто не ждёт.
  return `${login.toLowerCase()}@mdtrans.internal`;
}

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

  // Клиент вызывающего — только чтобы узнать, кто он.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) return fail(401, 'Не авторизован', headers);

  // service role — единственный способ создать пользователя с паролем
  // и обойти RLS для самой проверки роли вызывающего.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: caller } = await admin
    .from('employees')
    .select('role')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();
  if (!caller || caller.role !== 'admin') {
    return fail(403, 'Добавлять сотрудников может только администратор', headers);
  }

  const login = String(body.login ?? '').trim();
  const password = String(body.password ?? '');
  const name = String(body.name ?? '').trim();
  const lastName = body.last_name ? String(body.last_name).trim() : null;
  const phone = body.phone ? String(body.phone).trim() : null;
  const role = String(body.role ?? '');
  const permissions = (body.permissions as Record<string, unknown>) ?? {};
  const defaultVehicleId = body.default_vehicle_id ? String(body.default_vehicle_id) : null;

  if (!LOGIN_RE.test(login)) {
    return fail(400, 'Логин — 3–32 символа: латинские буквы, цифры, точка, дефис или подчёркивание', headers);
  }
  if (password.length < 6) return fail(400, 'Пароль — минимум 6 символов', headers);
  if (!name) return fail(400, 'Укажите имя', headers);
  if (!ROLES.includes(role)) return fail(400, 'Неизвестная роль', headers);

  const birthDate = body.birth_date ? String(body.birth_date) : null;
  const hireDate = body.hire_date ? String(body.hire_date) : null;
  const address = body.address ? String(body.address).trim() : null;
  const personalVehicleMake = body.personal_vehicle_make ? String(body.personal_vehicle_make).trim() : null;
  const personalVehiclePlate = body.personal_vehicle_plate ? String(body.personal_vehicle_plate).trim() : null;

  const isAdminRole = role === 'admin';
  const email = loginToEmail(login);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    const message = createError?.message.toLowerCase().includes('already')
      ? 'Такой логин уже занят'
      : (createError?.message ?? 'Не удалось создать пользователя');
    return fail(400, message, headers);
  }

  const { data: employee, error: insertError } = await admin
    .from('employees')
    .insert({
      auth_user_id: created.user.id,
      login,
      name,
      last_name: lastName,
      phone,
      birth_date: birthDate,
      hire_date: hireDate,
      address,
      personal_vehicle_make: personalVehicleMake,
      personal_vehicle_plate: personalVehiclePlate,
      role,
      account_status: 'active',
      can_manage_orders: isAdminRole ? true : Boolean(permissions.can_manage_orders ?? true),
      can_view_client_stats: isAdminRole ? true : Boolean(permissions.can_view_client_stats ?? true),
      can_view_contacts_and_amounts: isAdminRole ? true : Boolean(permissions.can_view_contacts_and_amounts ?? true),
      can_manage_own_schedule: isAdminRole ? true : Boolean(permissions.can_manage_own_schedule ?? false),
      default_vehicle_id: role === 'driver' ? defaultVehicleId : null,
    })
    .select()
    .single();

  if (insertError) {
    // Пользователь для входа создан, а строка сотрудника — нет: не
    // оставляем "повисший" аккаунт без роли, откатываем.
    await admin.auth.admin.deleteUser(created.user.id);
    const message = insertError.message.includes('employees_login_key')
      ? 'Такой логин уже занят'
      : insertError.message;
    return fail(400, message, headers);
  }

  return new Response(JSON.stringify({ employee }), { status: 200, headers });
});
