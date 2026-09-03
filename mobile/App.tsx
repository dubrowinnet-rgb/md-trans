import { ActivityIndicator, SafeAreaView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSession } from './src/hooks/useSession';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomePlaceholderScreen } from './src/screens/HomePlaceholderScreen';

export default function App() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <>
      {session ? <HomePlaceholderScreen session={session} /> : <LoginScreen />}
      <StatusBar style="auto" />
    </>
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
