import { ActivityIndicator, SafeAreaView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSession } from './src/hooks/useSession';
import { useCurrentEmployee } from './src/api/employees';
import { LoginScreen } from './src/screens/LoginScreen';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { DriverScreen } from './src/screens/DriverScreen';

const queryClient = new QueryClient();

function Root() {
  const { session, loading } = useSession();
  const employeeQuery = useCurrentEmployee(session?.user.id);

  if (loading || (session && employeeQuery.isLoading)) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (!session) return <LoginScreen />;

  // Пользователь с записью в employees (по auth_user_id) — водитель/грузчик,
  // остальные авторизованные пользователи — диспетчеры.
  if (employeeQuery.data) {
    return <DriverScreen session={session} employee={employeeQuery.data} />;
  }

  return <CalendarScreen session={session} />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Root />
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
