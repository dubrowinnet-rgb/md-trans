import { Redirect } from 'expo-router';
import { useSession } from '../providers/SessionProvider';

export default function Index() {
  const { session, employee } = useSession();
  if (!session) return <Redirect href="/login" />;
  const isCrew = employee?.role === 'driver' || employee?.role === 'loader';
  return <Redirect href={isCrew ? '/my-orders' : '/calendar'} />;
}
