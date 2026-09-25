// Правка уже существующего аккаунта сотрудника: логин, пароль и профиль
// (раздел «Команда» — админ должен видеть и менять логин/пароль и всю
// информацию о сотруднике).
//
// Отдельная функция, а не часть create-account: смена логина меняет email
// в auth.users, а смена пароля — это auth.admin.updateUserById, и то, и
// другое требует service role key по той же причине, что и создание
// аккаунта (см. create-account/index.ts) — с телефона напрямую это
// сделать нельзя.
//
// Деплой (после `supabase link`, см. supabase/README.md):
//   supabase functions deploy update-account

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const LOGIN_RE = /^[a-zA-Z0-9._-]{3,32}$/;

function loginToEmail(login: string) {
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

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) return fail(401, 'Не авторизован', headers);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: caller } = await admin
    .from('employees')
    .select('role')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();
  if (!caller || caller.role !== 'admin') {
    return fail(403, 'Менять сотрудников может только администратор', headers);
  }

  const id = String(body.id ?? '');
  if (!id) return fail(400, 'Не указан сотрудник', headers);

  const { data: target } = await admin
    .from('employees')
    .select('auth_user_id, login')
    .eq('id', id)
    .maybeSingle();
  if (!target) return fail(404, 'Сотрудник не найден', headers);

  const name = String(body.name ?? '').trim();
  if (!name) return fail(400, 'Укажите имя', headers);

  // Логин необязателен на редактировании: у сотрудников, заведённых
  // напрямую в Supabase до входа по логину, он может быть пустым, и
  // администратор не обязан заводить его прямо сейчас, если просто
  // правит другое поле — пустое значение оставляет логин как был.
  const loginInput = String(body.login ?? '').trim();
  let login = target.login as string | null;
  if (loginInput) {
    if (!LOGIN_RE.test(loginInput)) {
      return fail(400, 'Логин — 3–32 символа: латинские буквы, цифры, точка, дефис или подчёркивание', headers);
    }
    login = loginInput;
  }
  const password = body.password ? String(body.password) : '';
  if (password && password.length < 6) return fail(400, 'Пароль — минимум 6 символов', headers);

  if (target.auth_user_id && login && login !== target.login) {
    const { error: emailError } = await admin.auth.admin.updateUserById(target.auth_user_id, {
      email: loginToEmail(login),
    });
    if (emailError) {
      const message = emailError.message.toLowerCase().includes('already')
        ? 'Такой логин уже занят'
        : emailError.message;
      return fail(400, message, headers);
    }
  }
  if (password && target.auth_user_id) {
    const { error: passwordError } = await admin.auth.admin.updateUserById(target.auth_user_id, { password });
    if (passwordError) return fail(400, passwordError.message, headers);
  }

  const { data: employee, error: updateError } = await admin
    .from('employees')
    .update({
      name,
      last_name: body.last_name ? String(body.last_name).trim() : null,
      phone: body.phone ? String(body.phone).trim() : null,
      login,
      birth_date: body.birth_date ? String(body.birth_date) : null,
      hire_date: body.hire_date ? String(body.hire_date) : null,
      address: body.address ? String(body.address).trim() : null,
    })
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    const message = updateError.message.includes('employees_login_key')
      ? 'Такой логин уже занят'
      : updateError.message;
    return fail(400, message, headers);
  }

  return new Response(JSON.stringify({ employee }), { status: 200, headers });
});
