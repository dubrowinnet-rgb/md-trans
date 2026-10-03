import type { ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useFadeHighlight } from '../../hooks/useFadeHighlight';

// Обёртка для «подсветить на 5 секунд и затухнуть» — Правки 6, п.3/7.
export function FadeHighlight({
  active,
  style,
  children,
}: {
  active: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const backgroundColor = useFadeHighlight(active);
  return <Animated.View style={[style, { backgroundColor }]}>{children}</Animated.View>;
}
