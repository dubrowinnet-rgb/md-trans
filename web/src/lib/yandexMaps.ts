// Маршрут в Яндекс.Картах по адресам точек заказа. В отличие от телефона,
// маршрут строится от первой точки заказа, а не от местоположения
// диспетчера.
export function yandexMapsRouteUrl(addresses: string[]) {
  const points = addresses.map((a) => encodeURIComponent(a)).join('~');
  return `https://yandex.ru/maps/?rtext=${points}&rtt=auto`;
}
