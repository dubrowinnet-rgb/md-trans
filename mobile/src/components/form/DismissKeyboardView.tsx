import type { ReactNode } from 'react';
import { Keyboard, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

// Тап по пустому месту формы убирает клавиатуру. Pressable оборачивает
// ScrollView снаружи (не наоборот) — так тап по самому полю или кнопке
// внутри по-прежнему обрабатывает сначала он сам, а не эта обёртка:
// Pressable получает нажатие, только если его не забрал более глубокий
// обработчик, и не мешает прокрутке (та живёт своим жестом).
export function DismissKeyboardView({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable style={[styles.flex, style]} onPress={Keyboard.dismiss}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
