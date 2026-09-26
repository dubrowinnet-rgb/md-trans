// Автоподсказки адреса при вводе (доработки 3, п.2) — Yandex Geosuggest API.
// Ключ необязателен: без него suggestAddresses всегда возвращает пустой
// список, форма просто не показывает блок подсказок (см. AddressField).
// Получить ключ: https://developer.tech.yandex.ru/ → Geosuggest API.
const API_KEY = process.env.EXPO_PUBLIC_YANDEX_SUGGEST_API_KEY;

interface YandexSuggestResult {
  title?: { text?: string };
  address?: { formatted_address?: string };
}

export function yandexSuggestEnabled() {
  return Boolean(API_KEY);
}

// Ошибки (нет сети, невалидный ключ, лимит запросов) намеренно проглатываем
// и возвращаем [] — подсказки необязательны, форма ввода адреса должна
// работать и без них.
export async function suggestAddresses(query: string): Promise<string[]> {
  if (!API_KEY || query.trim().length < 3) return [];
  try {
    const url = `https://suggest-maps.yandex.ru/v1/suggest?apikey=${API_KEY}&text=${encodeURIComponent(
      query
    )}&lang=ru_RU&results=5`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = (await response.json()) as { results?: YandexSuggestResult[] };
    const addresses = (data.results ?? [])
      .map((r) => r.address?.formatted_address ?? r.title?.text)
      .filter((a): a is string => Boolean(a));
    return [...new Set(addresses)];
  } catch {
    return [];
  }
}
