import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Appbar, List } from 'react-native-paper';
import { useSession } from '../../providers/SessionProvider';

// Главный экран «Настройки» (доработки 1, п.2) — вход по имени/роли/
// иконке из AccountMenu, доступен с любого экрана и любой роли. Услуги,
// шаблоны смс и напоминания сотрудникам видит только администратор — он
// один ими управляет, остальные роли видят только свой профиль.
export default function SettingsScreen() {
  const { employee } = useSession();
  const isAdmin = employee?.role === 'admin';

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Настройки" />
      </Appbar.Header>
      <List.Section>
        <List.Item
          title="Мой профиль"
          description="Логин, телефон, пароль, оплата профиля"
          left={(props) => <List.Icon {...props} icon="account-circle-outline" />}
          right={(props) => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => router.push('/settings/profile')}
        />
        {isAdmin && (
          <>
            <List.Item
              title="Услуги"
              description="Каталог, цены, цвета, время по умолчанию"
              left={(props) => <List.Icon {...props} icon="truck-fast-outline" />}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push('/settings/services')}
            />
            <List.Item
              title="Шаблоны СМС"
              description="Тексты автоматических сообщений клиентам"
              left={(props) => <List.Icon {...props} icon="message-text-outline" />}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push('/settings/sms-templates')}
            />
            <List.Item
              title="Напоминания сотрудникам"
              description="За сколько минут напомнить о заказе"
              left={(props) => <List.Icon {...props} icon="bell-outline" />}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push('/settings/reminders')}
            />
            <List.Item
              title="Техподдержка"
              description="Обращения к владельцу сервиса"
              left={(props) => <List.Icon {...props} icon="headset" />}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push('/settings/support')}
            />
          </>
        )}
      </List.Section>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
