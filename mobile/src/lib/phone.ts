// Единый формат телефона по всему приложению (Максим, 2026-09-25):
// +7(ХХХ)ХХХ-ХХ-ХХ везде — в списках, формах и в базе. Та же логика, что
// уже в web/src/lib/phone.ts — числа должны совпадать в обоих приложениях.

// К единому виду без кода страны — чтобы «+7 916 000-00-02», «8 (916)
// 000 00 02» и «9160000002» считались одним и тем же номером (используется
// и formatPhone ниже, и при желании — для сравнения/поиска номеров).
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) return digits.slice(1);
  return digits;
}

// +7(ХХХ)ХХХ-ХХ-ХХ поверх normalizePhone. Номер, который не раскладывается
// на ровно 10 цифр (городской без кода, иностранный, обрывок), возвращаем
// как есть — не подгоняем силой под чужой формат.
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const core = normalizePhone(phone);
  if (!core || core.length !== 10) return phone;
  return `+7(${core.slice(0, 3)})${core.slice(3, 6)}-${core.slice(6, 8)}-${core.slice(8, 10)}`;
}

// Поле телефона, куда вводят с нуля (вход, «Команда», «Мой профиль») —
// Правки 6, п.1: код страны +7 всегда на месте, по мере набора цифр сама
// достраивается маска formatPhone.
//
// Поле всегда начинается с «+7» (см. PHONE_INPUT_EMPTY), поэтому в сырой
// строке на месте 0 всегда лежит эта служебная 7 — её снимаем всегда, а не
// только когда уже набраны все 11 цифр, как в normalizePhone (та рассчитана
// на готовый номер целиком). Если человек следом по привычке печатает ещё
// 8 или 7 вместо кода оператора (думает, что поле ещё пустое) — после снятия
// служебной цифры на месте 0 окажется эта лишняя, снимаем её тем же
// способом; настоящий номер всегда начинается на 9, так что цикл сам
// остановится, как только дойдёт до настоящих цифр, и ничего настоящего не
// отъест.
export const PHONE_INPUT_EMPTY = '+7';

export function maskPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  while (digits.length > 0 && (digits[0] === '7' || digits[0] === '8')) digits = digits.slice(1);
  const core = digits.slice(0, 10);
  let result = '+7';
  if (core.length > 0) result += `(${core.slice(0, 3)}`;
  if (core.length >= 3) result += ')';
  if (core.length > 3) result += core.slice(3, 6);
  if (core.length > 6) result += `-${core.slice(6, 8)}`;
  if (core.length > 8) result += `-${core.slice(8, 10)}`;
  return result;
}

// true, когда маска набрана полностью (ровно 10 цифр костяка) — этим, а не
// просто «поле не пустое» (оно и так никогда не пусто, см. PHONE_INPUT_EMPTY),
// проверяют готовность номера к отправке.
export function isPhoneInputComplete(value: string): boolean {
  return (normalizePhone(value) ?? '').length === 10;
}
