import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Divider, IconButton, Menu } from 'react-native-paper';
import { supabase } from '../../lib/supabase';
import type { Employee } from '../../api/employees';
import { useUnreadNotificationCounts } from '../../api/notifications';
import { formatTime } from '../../utils/date';

// Menu.Item (react-native-paper) не умеет отдельный трейлинг-бейдж с числом
// (только leadingIcon/trailingIcon — иконка, не контент) — дописываем
// число прямо в заголовок, как Максим и написал пример: «мои отчеты 1».
function withCount(title: string, count: number) {
  return count > 0 ? `${title} (${count})` : title;
}

// Левое меню сотрудника (Максим, 30.09, «Правки 3», п.5 — по образцу
// референса Bumpix, «не нужно перерисовывать всё как там, но сделай
// удобно»): профиль, график, отчёты (только у водителя — у грузчика их
// нет, settings/index.tsx скрывает пункт так же), уведомления, настройки,
// о приложении, статус синхронизации с принудительным обновлением, выход —
// одним местом вместо AccountMenu (настройки/выход) и отдельных иконок в
// Appbar (раньше «Мой график»/«Мои отчёты» дублировались в шапке
// календаря и тут — теперь только тут, см. (employee)/my-orders.tsx).
// Бейджи (Максим, 01.10, «Правки 5», п.9) — у каждого раздела с непрочитанным
// своя цифра (useUnreadNotificationCounts раскладывает один и тот же запрос
// ленты, миграция 0024, по kind), а на самом значке меню — их сумма; тот же
// суммарный бейдж держит и иконка приложения (useBadgeSync). «Служба
// поддержки» (Максим, 01.10, миграция 0025) — обращения к админу/диспетчеру
// своей компании, не к владельцу сервиса (см. employee-support.tsx).
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
  const unread = useUnreadNotificationCounts();

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
          <View>
            <IconButton icon="menu" size={24} style={styles.iconButton} />
            {unread.total > 0 && (
              <Badge style={styles.badge} size={16}>
                {unread.total}
              </Badge>
            )}
          </View>
        </Pressable>
      }
    >
      <Menu.Item leadingIcon="account-circle-outline" title="Профиль" onPress={() => go('/settings/profile')} />
      <Menu.Item leadingIcon="calendar-remove-outline" title="Мой график" onPress={() => go('/my-schedule')} />
      {isDriver && (
        <Menu.Item
          leadingIcon="clipboard-text-outline"
          title={withCount('Мои отчёты', unread.reports)}
          onPress={() => go('/settings/driver-feed')}
        />
      )}
      <Menu.Item
        leadingIcon="bell-outline"
        title={withCount('Уведомления', unread.orders)}
        onPress={() => go('/settings/notifications')}
      />
      <Menu.Item
        leadingIcon="headset"
        title={withCount('Служба поддержки', unread.support)}
        onPress={() => go('/settings/employee-support')}
      />
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
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
});
