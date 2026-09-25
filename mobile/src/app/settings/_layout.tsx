import { Stack } from 'expo-router';

// Каждый экран настроек сам рисует Appbar.Header (как вкладки (office)) —
// headerShown выключен на уровне стека, а не по экрану.
export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
