import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabaseQuery';
import type { Database, TicketStatus } from '@/types/database';

export type EmployeeSupportTicket = Database['public']['Tables']['employee_support_tickets']['Row'];
export type EmployeeSupportMessage = Database['public']['Tables']['employee_support_messages']['Row'];

// Обращения сотрудников к своей компании (миграция 0025) — отдельно от
// support_tickets.ts (там админ пишет владельцу сервиса). Миграция 0030
// (Правки 6, п.11) дала роли owner то же право читать/отвечать по любой
// компании, что у админа/диспетчера — по своей; этот файл — только для
// очереди владельца (аналог useAllTickets в supportTickets.ts), тот же
// запрос без фильтра по company_id — RLS сама отдаёт то, что положено.
export function useAllEmployeeTickets() {
  return useQuery({
    queryKey: ['employee-support-tickets', 'all'],
    queryFn: async (): Promise<(EmployeeSupportTicket & { employeeName: string; companyName: string })[]> => {
      const rows = await fetchAllPages<
        EmployeeSupportTicket & { employees: { name: string } | null; companies: { name: string } | null }
      >((from, to) =>
        supabase
          .from('employee_support_tickets')
          .select('*, employees(name), companies(name)')
          .order('updated_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to)
      );
      return rows.map((r) => ({ ...r, employeeName: r.employees?.name ?? '—', companyName: r.companies?.name ?? '—' }));
    },
  });
}

export function useEmployeeTicketMessages(ticketId: string | null) {
  return useQuery({
    queryKey: ['employee-support-tickets', 'messages', ticketId],
    enabled: Boolean(ticketId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_support_messages')
        .select('*')
        .eq('ticket_id', ticketId as string)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as EmployeeSupportMessage[];
    },
  });
}

export function useSendEmployeeTicketMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, senderId, body }: { ticketId: string; senderId: string; body: string }) => {
      const { error } = await supabase
        .from('employee_support_messages')
        .insert({ ticket_id: ticketId, sender_id: senderId, body });
      if (error) throw error;
      // Поднимаем тикет в очереди при ответе — как и в supportTickets.ts
      // (там же почему без триггера, значение перезапишет set_updated_at).
      await supabase.from('employee_support_tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticketId);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['employee-support-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['employee-support-tickets', 'messages', vars.ticketId] });
    },
  });
}

export function useSetEmployeeTicketStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TicketStatus }) => {
      const { error } = await supabase.from('employee_support_tickets').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-support-tickets'] });
    },
  });
}
