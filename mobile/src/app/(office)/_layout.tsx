import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from 'react-native-paper';
import { useSession } from '../../providers/SessionProvider';

// Общие вкладки диспетчера и администратора. «Команда» видна только
// администратору — заводить логины и права остальных может только он
// (href: null убирает вкладку из таб-бара и из навигации).
export default function OfficeLayout() {
  const theme = useTheme();
  const { employee } = useSession();
  const isAdmin = employee?.role === 'admin';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
      }}
    >
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Календарь',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="calendar-month" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Клиенты',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="card-account-phone" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          title: 'Команда',
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-group" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
