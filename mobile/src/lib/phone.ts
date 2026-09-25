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
