// Основной вход — по номеру телефона и паролю (доработки 3, п.4: логин
// сотрудникам больше не нужен), см. app/login.tsx и toE164Phone ниже.
//
// Эти две функции остаются только для СТАРОГО, свёрнутого способа входа —
// на экране входа под телефоном есть ссылка «Войти по логину или email»
// для аккаунтов, которым ещё не синхронизировали телефон на auth.users
// (см. providers/SessionProvider.tsx — синхронизация происходит один раз,
// автоматически, при первом входе после этой доработки; пока сотрудник ни
// разу не вошёл под обновлённым приложением, вход по логину — единственный
// рабочий способ, поэтому его нельзя убирать совсем).
const LOGIN_DOMAIN = '@mdtrans.internal';

export function loginToEmail(login: string) {
  return `${login.trim().toLowerCase()}${LOGIN_DOMAIN}`;
}

// Логин, введённый на экране входа, может быть и обычным email — так
// продолжает работать более ранняя учётная запись администратора,
// заведённая напрямую в Supabase Dashboard на его настоящий email.
export function loginInputToEmail(input: string) {
  const trimmed = input.trim();
  return trimmed.includes('@') ? trimmed : loginToEmail(trimmed);
}

// Телефон, введённый на экране входа, в E.164 — формат, который ждёт
// Supabase Auth для входа по телефону (та же логика, что и на сервере,
// см. supabase/functions/create-account/index.ts). null — ввод не
// раскладывается на телефон РФ (10 цифр после кода страны).
export function loginInputToE164(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const core = digits.length === 11 && (digits[0] === '7' || digits[0] === '8') ? digits.slice(1) : digits;
  if (core.length !== 10) return null;
  return `+7${core}`;
}
