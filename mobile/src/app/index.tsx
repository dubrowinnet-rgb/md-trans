import { Redirect } from 'expo-router';
import { useSession } from '../providers/SessionProvider';

export default function Index() {
  const { session, employee } = useSession();
  if (!session) return <Redirect href="/login" />;
  return <Redirect href={employee ? '/my-orders' : '/calendar'} />;
}
