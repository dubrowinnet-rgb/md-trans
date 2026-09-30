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
  const isDriver = employee?.role === 'driver';
  // Отчёты водителей проверяют администратор и диспетчер (миграция 0019).
  const canReviewReports = employee?.role === 'admin' || employee?.role === 'dispatcher';
  const canEarnPay = employee?.role === 'driver' || employee?.role === 'loader';

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
        {canEarnPay && (
          <List.Item
            title="Моя зарплата"
            description="Калькуляция: часы × ставка"
            left={(props) => <List.Icon {...props} icon="cash-multiple" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => router.push('/settings/pay-estimate')}
          />
        )}
        {isDriver && (
          <List.Item
            title="Мои отчёты"
            description="Лента отчётов за месяц: заказы, расходы, топливо, касса"
            left={(props) => <List.Icon {...props} icon="clipboard-text-outline" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => router.push('/settings/driver-feed')}
          />
        )}
        {canReviewReports && (
          <List.Item
            title="Отчёты водителей"
            description="Ленты отчётов: согласовать или вернуть с замечанием"
            left={(props) => <List.Icon {...props} icon="clipboard-check-outline" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => router.push('/settings/driver-reports')}
          />
        )}
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
              title="Рабочее время"
              description="Красит сетку календаря, задаёт точку её открытия"
              left={(props) => <List.Icon {...props} icon="clock-outline" />}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push('/settings/working-hours')}
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
        <List.Item
          title="О приложении"
          description="Версия, поддержка, политика конфиденциальности"
          left={(props) => <List.Icon {...props} icon="information-outline" />}
          right={(props) => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => router.push('/settings/about')}
        />
      </List.Section>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
