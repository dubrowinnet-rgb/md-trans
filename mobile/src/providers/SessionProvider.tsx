import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useCurrentEmployee, type Employee } from '../api/employees';

// Доработки 3, п.4: вход теперь по телефону, а не по логину — но у
// аккаунтов, заведённых до этой доработки, на auth.users телефон ещё не
// стоит (там только email). Раз в сессию, после успешного входа СТАРЫМ
// способом (пока он ещё поддерживается — см. app/login.tsx), тихо
// вызываем update-account с текущим (не изменившимся) телефоном — это
// достаточно, чтобы функция синхронизировала auth.users.phone (см.
// supabase/functions/update-account/index.ts), и со следующего раза вход
// по телефону уже сработает. Отмечаем флагом в AsyncStorage, чтобы не
// дёргать функцию на каждый запуск приложения без необходимости.
function syncPhoneAuthOnce(employee: Employee) {
  if (!employee.phone) return;
  const flagKey = `phoneAuthSynced:${employee.id}:${employee.phone}`;
  AsyncStorage.getItem(flagKey)
    .then((done) => {
      if (done) return;
      return supabase.functions
        .invoke('update-account', { body: { id: employee.id, phone: employee.phone } })
        .then(({ error }) => {
          if (!error) return AsyncStorage.setItem(flagKey, '1');
        });
    })
    .catch(() => {
      // Не страшно — попробуем снова при следующем входе/запуске.
    });
}

interface SessionState {
  session: Session | null;
  /**
   * Строка employees вошедшего пользователя — роль (admin/dispatcher/driver/
   * loader) и права берутся из неё (см. lib/permissions.ts). null — у
   * аккаунта нет доступа (см. app/_layout.tsx).
   */
  employee: Employee | null;
  isLoading: boolean;
}

const SessionContext = createContext<SessionState>({
  session: null,
  employee: null,
  isLoading: true,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const employeeQuery = useCurrentEmployee(session?.user.id);

  useEffect(() => {
    if (employeeQuery.data) syncPhoneAuthOnce(employeeQuery.data);
  }, [employeeQuery.data]);

  const value: SessionState = {
    session,
    employee: employeeQuery.data ?? null,
    isLoading: sessionLoading || (Boolean(session) && employeeQuery.isLoading),
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
