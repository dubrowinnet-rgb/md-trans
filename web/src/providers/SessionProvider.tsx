'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useCurrentEmployee, type Employee } from '@/api/employees';

interface SessionState {
  session: Session | null;
  // Строка employees вошедшего — из неё роль и права (lib/permissions.ts).
  employee: Employee | null;
  isLoading: boolean;
}

const SessionContext = createContext<SessionState>({ session: null, employee: null, isLoading: true });

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

// Веб-кабинет — только для администратора и диспетчера.
export function isOfficeRole(employee: Employee | null) {
  return employee?.role === 'admin' || employee?.role === 'dispatcher';
}
