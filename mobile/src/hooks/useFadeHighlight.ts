import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

// Подсветка «что изменилось» зелёным на 5 секунд с плавным затуханием —
// Правки 6, п.3 (карточка заказа) и п.7 (лента уведомлений), один и тот же
// визуальный язык в обоих местах. useNativeDriver: false — цвет фона
// нативным драйвером не анимируется.
const FADE_MS = 5000;
export const HIGHLIGHT_COLOR = 'rgba(34, 197, 94, 0.25)';
const TRANSPARENT = 'rgba(34, 197, 94, 0)';

export function useFadeHighlight(active: boolean) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    progress.stopAnimation();
    progress.setValue(1);
    Animated.timing(progress, { toValue: 0, duration: FADE_MS, useNativeDriver: false }).start();
  }, [active, progress]);
  return progress.interpolate({ inputRange: [0, 1], outputRange: [TRANSPARENT, HIGHLIGHT_COLOR] });
}
