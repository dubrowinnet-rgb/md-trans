import { createContext, useContext } from 'react';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import type { TextProps } from 'react-native';

interface ZoomRatio {
  liveScale: SharedValue<number>;
  committedScale: SharedValue<number>;
}

const ZoomRatioContext = createContext<ZoomRatio | null>(null);
export const ZoomRatioProvider = ZoomRatioContext.Provider;

// Текст внутри сетки календаря (часы на оси, время/клиент/адрес на карточке
// заказа) не должен визуально растягиваться вместе с живым превью пинч-зума
// — PagedCalendar ради плавности применяет scaleY ко всему телу сетки на
// каждый кадр жеста, вместо того чтобы пересчитывать раскладку (см. его
// комментарий у animatedBodyStyle), и тем же трансформом задевает буквы.
// На реальном устройстве это читалось как «шрифт меняется, а потом
// приходит в норму» (Максим, 01.10, «Правки 5», п.1). Текст здесь гасит
// родительский scaleY обратным — геометрия (высота строк/карточек)
// по-прежнему «дышит» на глаз, буквы остаются неизменного размера.
// Обычный Animated.Text (не react-native-paper), чтобы быть прямой заменой
// и для DayCells (сейчас paper Text, без кастомного шрифта в теме — разницы
// не будет), и для OrderBlock (сейчас обычный RN Text).
//
// Хук вызывается всегда одинаково (правила хуков) — вне PagedCalendar
// (контекста нет, например в будущем сторибуке) liveScale/committedScale
// подменяются константой, соотношение всегда 1, transform — тождественный.
const IDENTITY_SCALE = { value: 1 } as SharedValue<number>;

export function ZoomStableText({ style, children, ...rest }: TextProps) {
  const ctx = useContext(ZoomRatioContext);
  const liveScale = ctx?.liveScale ?? IDENTITY_SCALE;
  const committedScale = ctx?.committedScale ?? IDENTITY_SCALE;
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: committedScale.value / liveScale.value }],
  }));
  return (
    <Animated.Text style={[style, animatedStyle]} {...rest}>
      {children}
    </Animated.Text>
  );
}
