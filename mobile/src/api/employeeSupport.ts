import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

export type EmployeeSupportTicket = Database['public']['Tables']['employee_support_tickets']['Row'];
export type EmployeeSupportMessage = Database['public']['Tables']['employee_support_messages']['Row'];

// «Служба поддержки» сотрудника (Максим, 01.10, вторая половина
// отложенного пункта «Правки 3» п.5) — обращения к своей компании, в
// отличие от supportTickets.ts (обращения администратора к владельцу
// сервиса). RLS сама решает, что отдать: сотруднику — только свои,
// админу/диспетчеру — все обращения компании (useAllTickets ниже).
export function useMyTickets() {
  return useQuery({
    queryKey: ['employee-support-tickets', 'mine'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_support_tickets')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as EmployeeSupportTicket[];
    },
  });
}

export type EmployeeSupportTicketWithSender = EmployeeSupportTicket & { employees: { name: string } | null };

// Очередь для админа/диспетчера — те же строки, что и useMyTickets (RLS
// для них отдаёт все обращения компании), с именем автора (employees(name))
// — в списке «мои» это не нужно, сотрудник и так знает, что это его
// обращения. Отдельный хук для понятного кеша/ключа.
export function useCompanyTickets() {
  return useQuery({
    queryKey: ['employee-support-tickets', 'company'],
    queryFn: async () => {
      // Сортировка по статусу — на клиенте (open/in_progress прежде
      // resolved): алфавитный порядок status дал бы in_progress раньше
      // open, не по смыслу очереди.
      const { data, error } = await supabase
        .from('employee_support_tickets')
        .select('*, employees(name)')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as unknown as EmployeeSupportTicketWithSender[];
    },
  });
}

export function useTicketMessages(ticketId: string | null) {
  return useQuery({
    queryKey: ['employee-support-messages', ticketId],
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

// Заводит обращение и его первое сообщение двумя запросами подряд — как и
// в useCreateTicket (supportTickets.ts), без Edge Function атомарность не
// сделать, для обращения в поддержку это не критично.
export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      companyId,
      employeeId,
      subject,
      body,
    }: {
      companyId: string;
      employeeId: string;
      subject: string;
      body: string;
    }) => {
      const { data: ticket, error } = await supabase
        .from('employee_support_tickets')
        .insert({ company_id: companyId, employee_id: employeeId, subject })
        .select()
        .single();
      if (error) throw error;
      const { error: msgError } = await supabase
        .from('employee_support_messages')
        .insert({ ticket_id: ticket.id, sender_id: employeeId, body });
      if (msgError) throw msgError;
      return ticket as EmployeeSupportTicket;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employee-support-tickets'] }),
  });
}

export function useSendTicketMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, senderId, body }: { ticketId: string; senderId: string; body: string }) => {
      const { error } = await supabase.from('employee_support_messages').insert({ ticket_id: ticketId, sender_id: senderId, body });
      if (error) throw error;
      // Поднимаем тикет в списке при новом сообщении с любой стороны —
      // как и в supportTickets.ts (там же почему без триггера).
      await supabase.from('employee_support_tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticketId);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['employee-support-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['employee-support-messages', vars.ticketId] });
    },
  });
}

// Смена статуса — только админ/диспетчер (RLS), прямое обновление без
// RPC: тут нет ни проверки перехода состояний, ни обязательного
// комментария, как у driver_reports, так что прямой update() достаточно.
export function useSetTicketStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: EmployeeSupportTicket['status'] }) => {
      const { error } = await supabase.from('employee_support_tickets').update({ status }).eq('id', ticketId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employee-support-tickets'] }),
  });
}
