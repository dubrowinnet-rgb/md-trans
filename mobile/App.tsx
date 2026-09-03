import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { supabase } from './src/lib/supabase';

type ConnectionStatus = 'checking' | 'ok' | 'error';

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [message, setMessage] = useState('');

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ error }) => {
        if (error) {
          setStatus('error');
          setMessage(error.message);
        } else {
          setStatus('ok');
        }
      })
      .catch((err: Error) => {
        setStatus('error');
        setMessage(err.message);
      });
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Грузоперевозки — MVP</Text>

      {status === 'checking' && (
        <View style={styles.row}>
          <ActivityIndicator />
          <Text style={styles.text}>Проверка подключения к Supabase…</Text>
        </View>
      )}

      {status === 'ok' && (
        <Text style={[styles.text, styles.ok]}>✅ Supabase-клиент подключён</Text>
      )}

      {status === 'error' && (
        <View>
          <Text style={[styles.text, styles.error]}>❌ Ошибка подключения к Supabase</Text>
          <Text style={styles.text}>{message}</Text>
        </View>
      )}

      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    fontSize: 14,
    textAlign: 'center',
  },
  ok: {
    color: '#0a8a3c',
  },
  error: {
    color: '#c0392b',
  },
});
