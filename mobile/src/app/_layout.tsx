import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Button, PaperProvider, Text } from 'react-native-paper';
import { registerTranslation, ru } from 'react-native-paper-dates';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../providers/SessionProvider';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';

SplashScreen.preventAutoHideAsync();
registerTranslation('ru', ru);

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={theme}>
          <SessionProvider>
            <RootNavigator />
          </SessionProvider>
          <StatusBar style="dark" />
        </PaperProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

// Роль входа теперь всегда читается из employees.role (миграция 0005):
// админ и диспетчер делят экраны (office), водитель и грузчик — (employee).
// Вошедший без строки в employees больше не считается диспетчером по
// умолчанию — доступа у него нет, только выйти и попросить администратора
// завести аккаунт.
function RootNavigator() {
  const { session, employee, isLoading } = useSession();

  useEffect(() => {
    if (!isLoading) SplashScreen.hideAsync();
  }, [isLoading]);

  if (isLoading) return null;

  const isOffice = Boolean(session && (employee?.role === 'admin' || employee?.role === 'dispatcher'));
  const isCrew = Boolean(session && (employee?.role === 'driver' || employee?.role === 'loader'));
  const noAccess = Boolean(session && !employee);

  if (noAccess) return <NoAccessScreen />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      {/* containedModal, не modal: обычный "modal" на iOS презентуется
          отдельным слоем поверх ВСЕГО окна, и Paper-диалоги (ServicePicker,
          подтверждение удаления, CrewDialog и т.п.), открытые с этих
          экранов, либо рендерились за ним, либо не показывались вовсе
          (баг с реального iPhone) — containedModal использует
          UIModalPresentationCurrentContext, который остаётся в слое
          навигационного стека и не перекрывает обычный Portal.Host из
          PaperProvider. На Android presentation всё равно ведёт себя как
          push, так что здесь ничего не меняется. */}
      <Stack.Protected guard={isOffice}>
        <Stack.Screen name="(office)" />
      </Stack.Protected>
      <Stack.Protected guard={isCrew}>
        <Stack.Screen name="(employee)" />
      </Stack.Protected>
      {/* order/new живёт здесь, а не только под isOffice: водителю/грузчику
          с выданным can_manage_orders тоже нужно уметь открыть эту форму
          (например, кнопкой «Копировать заказ» на карточке заказа) — сам
          экран уже проверяет canManage внутри и показывает «Недостаточно
          прав», если его открыли без этого права. */}
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen
          name="order/new"
          options={{ presentation: 'containedModal', headerShown: true, title: 'Новый заказ' }}
        />
        <Stack.Screen
          name="order/[id]"
          options={{ presentation: 'containedModal', headerShown: true, title: 'Заказ' }}
        />
        <Stack.Screen
          name="my-schedule"
          options={{ presentation: 'containedModal', headerShown: true, title: 'Мой график' }}
        />
      </Stack.Protected>
    </Stack>
  );
}

function NoAccessScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text variant="titleMedium" style={styles.text}>
          У этого аккаунта нет доступа к приложению.
        </Text>
        <Text variant="bodyMedium" style={styles.text}>
          Попросите администратора завести для вас логин на экране «Команда».
        </Text>
        <Button mode="outlined" onPress={() => supabase.auth.signOut()}>
          Выйти
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  text: {
    textAlign: 'center',
  },
});
