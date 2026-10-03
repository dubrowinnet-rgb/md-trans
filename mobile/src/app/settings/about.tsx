import { useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Appbar, Button, List, Text } from 'react-native-paper';

// «О приложении» (Максим, 30.09, «Правки 3», п.5, по образцу référence
// Bumpix) — версия берётся из app.json динамически, а не хардкодом, чтобы
// не расходилась при следующих релизах. Ссылок на видео-уроки и FAQ пока
// нет — Максим их не присылал, показывать несуществующие ссылки не стали;
// добавить, когда появится, что на них ставить.
//
// Блок «Обновление» и кнопка проверки (02.10) — ON_LOAD и фоновая проверка
// (useForegroundUpdateCheck) работают тихо и глотают ошибки, из-за этого
// было невозможно отличить «обновление не дошло» от «дошло, но не видно».
// Здесь показываем дату реально запущенного JS-бандла и даём кнопку, чтобы
// проверить и применить обновление вручную, с видимым результатом.
export default function AboutScreen() {
  const version = Constants.expoConfig?.version ?? '—';
  const [checking, setChecking] = useState(false);

  const updateInfo = Updates.isEmbeddedLaunch
    ? 'встроено в установку (ещё не обновлялось)'
    : Updates.createdAt
      ? Updates.createdAt.toLocaleString('ru-RU')
      : '—';

  async function checkForUpdates() {
    setChecking(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        Alert.alert('Обновлений нет', 'У вас уже последняя версия.');
        return;
      }
      await Updates.fetchUpdateAsync();
      Alert.alert('Обновление загружено', 'Сейчас перезапущу приложение, чтобы применить его.', [
        { text: 'ОК', onPress: () => Updates.reloadAsync() },
      ]);
    } catch (error) {
      Alert.alert('Не удалось проверить', error instanceof Error ? error.message : String(error));
    } finally {
      setChecking(false);
    }
  }

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="О приложении" />
      </Appbar.Header>
      <View style={styles.hero}>
        {/* eslint-disable-next-line @typescript-eslint/no-require-imports */}
        <Image source={require('../../../assets/images/icon.png')} style={styles.icon} />
        <Text variant="headlineSmall">Мурзик</Text>
        <Text variant="bodyMedium" style={styles.tagline}>
          Всё под лапой
        </Text>
        <Text variant="bodySmall" style={styles.version}>{`Версия ${version}`}</Text>
      </View>
      <List.Section>
        <List.Item
          title="Служба поддержки"
          description="support@myrzik.ru"
          left={(props) => <List.Icon {...props} icon="email-outline" />}
        />
        <List.Item
          title="Политика конфиденциальности"
          left={(props) => <List.Icon {...props} icon="shield-outline" />}
          right={(props) => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => router.push('/settings/privacy-policy')}
        />
        {Updates.isEnabled && (
          <List.Item
            title="Обновление"
            description={`Установлено: ${updateInfo}`}
            left={(props) => <List.Icon {...props} icon="cloud-sync-outline" />}
          />
        )}
      </List.Section>
      {Updates.isEnabled && (
        <View style={styles.updateButton}>
          <Button mode="outlined" onPress={checkForUpdates} loading={checking} disabled={checking}>
            Проверить обновления
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 2,
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 16,
    marginBottom: 8,
  },
  tagline: {
    opacity: 0.6,
  },
  version: {
    opacity: 0.5,
    marginTop: 8,
  },
  updateButton: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});
