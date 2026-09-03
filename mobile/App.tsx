import { ActivityIndicator, SafeAreaView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSession } from './src/hooks/useSession';
import { LoginScreen } from './src/screens/LoginScreen';
import { CalendarScreen } from './src/screens/CalendarScreen';

const queryClient = new QueryClient();

function Root() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return session ? <CalendarScreen session={session} /> : <LoginScreen />;
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
