// Координаты адреса для построения маршрута в Яндекс.Навигаторе — его
// схема (yandexnavi://build_route_on_map) принимает только lat/lon, в
// отличие от Яндекс.Карт, которые понимают текстовый адрес напрямую
// (lib/yandexMaps.ts). Ключ ОТДЕЛЬНЫЙ от ключа подсказок адреса
// (EXPO_PUBLIC_YANDEX_SUGGEST_API_KEY из lib/yandexSuggest.ts) — у Яндекса
// каждый API выдаёт свой ключ, ключ подсказок для геокодера не подходит.
// Получить: https://developer.tech.yandex.ru/ → «Geocoder API».
// Ключ необязателен: без него geocodeAddress всегда возвращает null,
// построение маршрута просто откатывается на Яндекс.Карты/веб-ссылку
// (см. openYandexRoute в order/[id].tsx) — как и у подсказок адреса.
const API_KEY = process.env.EXPO_PUBLIC_YANDEX_GEOCODER_API_KEY;

export interface GeoPoint {
  lat: number;
  lon: number;
}

export function yandexGeocodeEnabled() {
  return Boolean(API_KEY);
}

// Ошибки (нет сети, невалидный ключ, лимит запросов, адрес не найден)
// намеренно проглатываем и возвращаем null — геокодирование необязательно,
// маршрут должен открываться (пусть и не в Навигаторе) даже без него.
export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  if (!API_KEY || !address.trim()) return null;
  try {
    const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${API_KEY}&format=json&results=1&geocode=${encodeURIComponent(
      address
    )}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const pos: string | undefined =
      data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject?.Point?.pos;
    if (!pos) return null;
    const [lon, lat] = pos.split(' ').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}
