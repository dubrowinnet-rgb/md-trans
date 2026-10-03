import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Avatar, Divider, Menu } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../providers/SessionProvider';
import { ACCOUNT_ROLE_LABELS } from '../../theme';

// Точка входа в «Настройки» — нажатие на имя/роль/иконку (доработки 1,
// п.2). Раньше «Выйти» была отдельной кнопкой на некоторых экранах (и
// вовсе отсутствовала на части других) — теперь и она, и «Настройки»
// открываются из одного места на КАЖДОМ экране (office), так что доступ
// к настройкам есть отовсюду, как и просил Максим.
export function AccountMenu() {
  const { employee } = useSession();
  const [visible, setVisible] = useState(false);
  if (!employee) return null;

  const initial = employee.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={
        <Pressable onPress={() => setVisible(true)} accessibilityLabel="Аккаунт и настройки" style={styles.touch}>
          <Avatar.Text size={32} label={initial} />
        </Pressable>
      }
    >
      <Menu.Item title={`${employee.name} · ${ACCOUNT_ROLE_LABELS[employee.role]}`} disabled />
      <Divider />
      <Menu.Item
        leadingIcon="cog-outline"
        title="Настройки"
        onPress={() => {
          setVisible(false);
          router.push('/settings');
        }}
      />
      <Menu.Item
        leadingIcon="logout"
        title="Выйти"
        onPress={() => {
          setVisible(false);
          supabase.auth.signOut();
        }}
      />
    </Menu>
  );
}

const styles = StyleSheet.create({
  touch: {
    marginRight: 12,
  },
});
