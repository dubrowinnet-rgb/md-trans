import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

// Компактная строка поля заказа (по образцу референса Максима, 02.10): серая
// плашка-подпись сверху на всю ширину, под ней — строка с цветной иконкой и
// значением. Заменяет громоздкие TextInput(mode="outlined") с плавающим
// лейблом там, где достаточно иконки + текста.
export function FieldLabel({ children }: { children: string }) {
  return (
    <View style={styles.labelBar}>
      <Text variant="labelSmall" style={styles.labelText}>
        {children.toUpperCase()}
      </Text>
    </View>
  );
}

export function CompactField({
  label,
  icon,
  iconColor = '#5b21b6',
  onPress,
  right,
  multiline,
  children,
}: {
  label: string;
  icon?: string;
  iconColor?: string;
  onPress?: () => void;
  right?: ReactNode;
  multiline?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        android_ripple={onPress ? { color: '#ede9fe' } : undefined}
        style={[styles.row, multiline && styles.rowMultiline]}
      >
        {icon && (
          <View style={[styles.iconBadge, { backgroundColor: `${iconColor}1f` }]}>
            <Icon source={icon} size={18} color={iconColor} />
          </View>
        )}
        <View style={styles.content}>{children}</View>
        {right}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    backgroundColor: '#ffffff',
  },
  labelBar: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 16,
    paddingVertical: 3,
  },
  labelText: {
    color: '#6b7280',
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    minHeight: 46,
  },
  rowMultiline: {
    alignItems: 'flex-start',
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
});
