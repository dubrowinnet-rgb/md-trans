const { withAndroidManifest } = require('expo/config-plugins');

// Android 11+ (targetSdk 30+) скрывает от приложения сведения об остальных
// установленных приложениях, если явно не объявить <queries> в манифесте —
// без этого Linking.openURL(custom-scheme://...) может не находить
// установленное приложение (молча откатываясь на запасной вариант) даже
// когда оно есть на телефоне. Три прошлых попытки построить маршрут
// (yandexmaps://, потом yandex.ru/maps) никогда не объявляли видимость
// пакетов Яндекс.Карт/Навигатора — вероятная настоящая причина, почему
// ни одна не сработала на реальном устройстве (Максим, 01.10, «Правки 5»,
// п.2). Нужна пересборка (не OTA) — меняет нативный AndroidManifest.xml.
const PACKAGES = ['ru.yandex.yandexnavi', 'ru.yandex.yandexmaps'];

module.exports = function withAndroidQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!Array.isArray(manifest.queries)) {
      manifest.queries = [];
    }
    if (manifest.queries.length === 0) {
      manifest.queries.push({});
    }
    const queries = manifest.queries[0];
    if (!Array.isArray(queries.package)) {
      queries.package = [];
    }
    for (const name of PACKAGES) {
      const exists = queries.package.some((p) => p?.$?.['android:name'] === name);
      if (!exists) {
        queries.package.push({ $: { 'android:name': name } });
      }
    }
    return config;
  });
};
