import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useCurrentEmployee, type Employee } from '../api/employees';

// Доработки 3, п.4: вход теперь по телефону, а не по логину — но у
// аккаунтов, заведённых до этой доработки, на auth.users телефон ещё не
// стоит (там только email). Правки 6, п.1 убрала запасной вход по
// логину/email с экрана входа — но пока у такого аккаунта есть ХОТЯ БЫ
// ОДНА валидная сессия (вход до этой доработки), при каждом открытии
// приложения с этой сессией тихо вызываем update-account с текущим (не
// изменившимся) телефоном — этого достаточно, чтобы функция
// синхронизировала auth.users.phone (см.
// supabase/functions/update-account/index.ts), и со следующего раза вход
// по телефону уже сработает. Отмечаем флагом в AsyncStorage, чтобы не
// дёргать функцию на каждый запуск приложения без необходимости. Если
// сессия уже истекла ДО того, как синхронизация хоть раз отработала,
// автоматического пути входа больше нет — только через Профиль другого
// уже вошедшего администратора/владельца, либо напрямую в Supabase.
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
