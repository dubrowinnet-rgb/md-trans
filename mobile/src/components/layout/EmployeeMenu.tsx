import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Divider, IconButton, Menu } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import type { Employee } from '../../api/employees';
import { formatTime } from '../../utils/date';

// Левое меню сотрудника (Максим, 30.09, «Правки 3», п.5 — по образцу
// референса Bumpix, «не нужно перерисовывать всё как там, но сделай
// удобно»): профиль, график, отчёты (только у водителя — у грузчика их
// нет, settings/index.tsx скрывает пункт так же), настройки, о приложении,
// статус синхронизации с принудительным обновлением, выход — одним местом
// вместо AccountMenu (настройки/выход) и отдельных иконок в Appbar
// (раньше «Мой график»/«Мои отчёты» дублировались в шапке календаря и тут
// — теперь только тут, см. (employee)/my-orders.tsx). «Уведомления» и
// «Служба поддержки» в референсе сюда не попали — под них ещё нет
// экрана/канала у сотрудника (не админа), добавлять пустую ссылку не
// стали.
export function EmployeeMenu({
  employee,
  lastSyncedAt,
  syncing,
  onSync,
}: {
  employee: Employee;
  lastSyncedAt: Date | null;
  syncing: boolean;
  onSync: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const isDriver = employee.role === 'driver';

  const go = (path: Parameters<typeof router.push>[0]) => {
    setVisible(false);
    router.push(path);
  };

  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={
        <Pressable onPress={() => setVisible(true)} accessibilityLabel="Меню" style={styles.touch}>
          <IconButton icon="menu" size={24} style={styles.iconButton} />
        </Pressable>
      }
    >
      <Menu.Item leadingIcon="account-circle-outline" title="Профиль" onPress={() => go('/settings/profile')} />
      <Menu.Item leadingIcon="calendar-remove-outline" title="Мой график" onPress={() => go('/my-schedule')} />
      {isDriver && (
        <Menu.Item
          leadingIcon="clipboard-text-outline"
          title="Мои отчёты"
          onPress={() => go('/settings/driver-feed')}
        />
      )}
      <Menu.Item leadingIcon="cog-outline" title="Настройки" onPress={() => go('/settings')} />
      <Menu.Item leadingIcon="information-outline" title="О приложении" onPress={() => go('/settings/about')} />
      <Divider />
      <Menu.Item
        leadingIcon="sync"
        title={lastSyncedAt ? `Синхронизировано: ${formatTime(lastSyncedAt)}` : 'Синхронизация…'}
        disabled={syncing}
        onPress={() => {
          onSync();
          setVisible(false);
        }}
      />
      <Divider />
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
    marginLeft: -4,
  },
  iconButton: {
    margin: 0,
  },
});
