// Вход — только по номеру телефона и паролю (Правки 6, п.1), см. app/login.tsx.
//
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
