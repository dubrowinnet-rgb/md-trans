import { Platform } from 'react-native';
import { presentContactPickerAsync, requestPermissionsAsync } from 'expo-contacts/legacy';

export type PickedContact = { name: string; phone: string };

// Приводим номер к виду +7XXXXXXXXXX: в записной книжке он часто записан
// как «8 (999) 111-22-33».
export function normalizePhone(raw: string) {
  const digits = raw.replace(/[^\d+]/g, '');
  if (/^8\d{10}$/.test(digits)) return `+7${digits.slice(1)}`;
  if (/^7\d{10}$/.test(digits)) return `+${digits}`;
  return digits;
}

// Открывает записную книжку телефона и возвращает имя и номер выбранного
// контакта; null — если контакт не выбрали. Используем системный выбор
// контакта из expo-contacts/legacy: на iOS он отдаёт выбранный контакт без
// доступа ко всей книжке. Android читает контакт после выбора, поэтому там
// сначала спрашиваем разрешение.
export async function pickPhoneContact(): Promise<PickedContact | null> {
  if (Platform.OS === 'web') return null;
  if (Platform.OS === 'android') {
    const permission = await requestPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Нет доступа к контактам. Разрешите его в настройках телефона.');
    }
  }
  const contact = await presentContactPickerAsync();
  if (!contact) return null;
  const name =
    contact.name?.trim() ||
    [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() ||
    contact.company?.trim() ||
    '';
  const phones = contact.phoneNumbers ?? [];
  const phone = (phones.find((p) => p.isPrimary) ?? phones[0])?.number ?? '';
  return { name, phone: normalizePhone(phone) };
}
