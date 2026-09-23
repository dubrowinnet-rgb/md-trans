import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';
import { registerTranslation, ru } from 'react-native-paper-dates';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../providers/SessionProvider';
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

// Роль определяется так же, как раньше: есть строка в employees с
// auth_user_id вошедшего пользователя — это водитель/грузчик, иначе диспетчер.
function RootNavigator() {
  const { session, employee, isLoading } = useSession();

  useEffect(() => {
    if (!isLoading) SplashScreen.hideAsync();
  }, [isLoading]);

  if (isLoading) return null;

  const isEmployee = Boolean(session && employee);
  const isDispatcher = Boolean(session && !employee);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={isDispatcher}>
        <Stack.Screen name="(dispatcher)" />
        <Stack.Screen
          name="order/new"
          options={{ presentation: 'modal', headerShown: true, title: 'Новый заказ' }}
        />
      </Stack.Protected>
      <Stack.Protected guard={isEmployee}>
        <Stack.Screen name="(employee)" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen
          name="order/[id]"
          options={{ presentation: 'modal', headerShown: true, title: 'Заказ' }}
        />
      </Stack.Protected>
    </Stack>
  );
}
