// Живые подсказки адреса — Yandex Geosuggest API, как в мобильном приложении
// (mobile/src/lib/yandexSuggest.ts). Ключ вшивается в сборку из
// NEXT_PUBLIC_YANDEX_SUGGEST_API_KEY (на сервере — YANDEX_SUGGEST_API_KEY в
// .env Supabase, см. deploy/web/setup-web.sh). Без ключа подсказки Яндекса
// просто не показываются, остаются адреса из прошлых заказов.
const API_KEY = process.env.NEXT_PUBLIC_YANDEX_SUGGEST_API_KEY;

interface YandexSuggestResult {
  title?: { text?: string };
  subtitle?: { text?: string };
  address?: { formatted_address?: string };
}

export function yandexSuggestEnabled() {
  return Boolean(API_KEY);
}

// Ошибки (нет сети, неверный ключ, лимит запросов) намеренно проглатываем:
// подсказки необязательны, адрес всегда можно ввести вручную.
export async function suggestAddresses(query: string): Promise<string[]> {
  if (!API_KEY || query.trim().length < 3) return [];
  try {
    // print_address=1 — полный адрес («Россия, Москва, Тверская улица, 7»),
    // а не только заголовок («Тверская улица, 7») без города.
    const url =
      `https://suggest-maps.yandex.ru/v1/suggest?apikey=${API_KEY}` +
      `&text=${encodeURIComponent(query)}&lang=ru_RU&results=5&print_address=1`;
    const response = await fetch(url);
    if (!response.ok) {
      // Видно в консоли браузера (F12) — 403 значит ключ не подходит.
      console.warn('Yandex Geosuggest:', response.status, await response.text().catch(() => ''));
      return [];
    }
    const data = (await response.json()) as { results?: YandexSuggestResult[] };
    const addresses = (data.results ?? [])
      .map((r) => {
        if (r.address?.formatted_address) return r.address.formatted_address;
        const title = r.title?.text;
        const subtitle = r.subtitle?.text;
        return title && subtitle ? `${subtitle}, ${title}` : title;
      })
      .filter((a): a is string => Boolean(a));
    return [...new Set(addresses)];
  } catch (e) {
    console.warn('Yandex Geosuggest недоступен:', e);
    return [];
  }
}
