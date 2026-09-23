// Маршрут в Яндекс.Картах по адресам точек заказа (раздел 7 ТЗ).
// Пустая первая точка в rtext — «от моего местоположения». На телефоне с
// установленными Яндекс.Картами ссылка открывает приложение, иначе сайт.
// Прямой deep link в Яндекс.Навигатор требует координат, а для них нужен
// геокодер Яндекса с API-ключом — это следующий шаг.
export function yandexMapsRouteUrl(addresses: string[]) {
  const points = ['', ...addresses].map((a) => encodeURIComponent(a)).join('~');
  return `https://yandex.ru/maps/?rtext=${points}&rtt=auto`;
}
