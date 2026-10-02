'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { REFERENCE_STALE_TIME } from '@/lib/supabaseQuery';
import type { Employee } from '@/api/employees';

interface SessionState {
  session: Session | null;
  // Строка employees вошедшего — из неё роль и права (lib/permissions.ts).
  employee: Employee | null;
  isLoading: boolean;
}

const SessionContext = createContext<SessionState>({ session: null, employee: null, isLoading: true });

function useCurrentEmployee(authUserId: string | undefined) {
  return useQuery({
    queryKey: ['current-employee', authUserId],
    enabled: Boolean(authUserId),
    staleTime: REFERENCE_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('auth_user_id', authUserId as string)
        .maybeSingle();
      if (error) throw error;
      return data as Employee | null;
    },
  });
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Вышли или вошёл другой человек — выбрасываем всё загруженное, чтобы
    // новый вход не увидел даже на миг чужие заказы и клиентов из кэша.
    const apply = (next: Session | null) => {
      const nextUserId = next?.user.id ?? null;
      if (userIdRef.current !== null && userIdRef.current !== nextUserId) queryClient.clear();
      userIdRef.current = nextUserId;
      setSession(next);
    };
    supabase.auth.getSession().then(({ data }) => {
      apply(data.session);
      setSessionLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => apply(newSession));
    return () => subscription.subscription.unsubscribe();
  }, [queryClient]);

  const employeeQuery = useCurrentEmployee(session?.user.id);

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

// Компания вошедшего. Каждый запрос к данным компании дополнительно
// фильтруется по ней: RLS и так не пустит в чужие строки, но с явным
// условием база сразу идёт по индексу компании, а не перебирает строки
// всех компаний сервиса (замеры на 1000 компаниях: отчёты водителей
// 3,7 с → 0,02 с). У владельца сервиса компании нет — null.
export function useCompanyId(): string | null {
  return useContext(SessionContext).employee?.company_id ?? null;
}

// Веб-кабинет — только для администратора и диспетчера.
export function isOfficeRole(employee: Employee | null) {
  return employee?.role === 'admin' || employee?.role === 'dispatcher';
}
