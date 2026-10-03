import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

// Правки 6 (01.10, по следам скриншотов/видео со старым интерфейсом):
// app.json шлёт проверку обновления только при холодном старте
// (updates.checkAutomatically: "ON_LOAD"), а Максим присылал скриншоты с
// текстом, которого в коде уже не было несколько OTA-публикаций — то есть
// приложение всё это время ни разу не перезапускалось по-настоящему
// (см. п.6: Xiaomi держит его в фоне даже после «закрыть все»). Раз
// холодного старта можно месяцами не дождаться, проверяем ещё и при
// каждом возврате приложения на передний план — тихо, без вопросов
// пользователю, тем же принципом, что и ON_LOAD (commit cee537f: «без
// ожидания проверки обновления»). Троттлинг на 60 секунд — чтобы
// частое сворачивание/разворачивание не долбило сеть и эндпоинт обновлений.
const MIN_INTERVAL_MS = 60_000;

export function useForegroundUpdateCheck() {
  const lastCheckRef = useRef(0);

  useEffect(() => {
    if (!Updates.isEnabled) return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const now = Date.now();
      if (now - lastCheckRef.current < MIN_INTERVAL_MS) return;
      lastCheckRef.current = now;

      (async () => {
        try {
          const result = await Updates.checkForUpdateAsync();
          if (!result.isAvailable) return;
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        } catch {
          // Тихо игнорируем — офлайн/таймаут и т.п., следующий возврат
          // на передний план (или холодный старт) попробует снова.
        }
      })();
    });

    return () => subscription.remove();
  }, []);
}
