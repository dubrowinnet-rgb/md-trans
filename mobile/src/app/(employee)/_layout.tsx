import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useSession } from '../../providers/SessionProvider';
import { registerForPushNotifications } from '../../lib/pushNotifications';

export default function EmployeeLayout() {
  const { employee } = useSession();

  useEffect(() => {
    if (employee) registerForPushNotifications(employee.id);
  }, [employee]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
