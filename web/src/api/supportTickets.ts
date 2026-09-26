import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Database, TicketStatus } from '@/types/database';

export type { TicketStatus };

export type SupportTicket = Database['public']['Tables']['support_tickets']['Row'];
export type SupportTicketMessage = Database['public']['Tables']['support_ticket_messages']['Row'];

// Обращения текущего администратора («Техподдержка» в панели администратора).
export function useMyTickets(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['support-tickets', 'mine', employeeId],
    enabled: Boolean(employeeId),
    queryFn: async (): Promise<SupportTicket[]> => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('created_by', employeeId as string)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as SupportTicket[];
    },
  });
}

// Очередь обращений для владельца сервиса — по всем компаниям сразу.
export function useAllTickets() {
  return useQuery({
    queryKey: ['support-tickets', 'all'],
    queryFn: async (): Promise<(SupportTicket & { companyName: string })[]> => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*, companies(name)')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const rows = data as unknown as (SupportTicket & { companies: { name: string } | null })[];
      return rows.map((r) => ({ ...r, companyName: r.companies?.name ?? '—' }));
    },
  });
}

export function useTicketMessages(ticketId: string | null) {
  return useQuery({
    queryKey: ['support-tickets', 'messages', ticketId],
    enabled: Boolean(ticketId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_ticket_messages')
        .select('*')
        .eq('ticket_id', ticketId as string)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as SupportTicketMessage[];
    },
  });
}

// Заводит обращение и его первое сообщение — двумя запросами подряд (не
// в одной транзакции: без edge function атомарность не сделать, а для
// обращения в поддержку это не критично).
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
        .from('support_tickets')
        .insert({ company_id: companyId, created_by: employeeId, subject, status: 'open' })
        .select()
        .single();
      if (error) throw error;
      const { error: msgError } = await supabase
        .from('support_ticket_messages')
        .insert({ ticket_id: ticket.id, sender_id: employeeId, body });
      if (msgError) throw msgError;
      return ticket as SupportTicket;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
    },
  });
}

export function useSendTicketMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ticketId,
      senderId,
      body,
    }: {
      ticketId: string;
      senderId: string;
      body: string;
    }) => {
      const { error } = await supabase
        .from('support_ticket_messages')
        .insert({ ticket_id: ticketId, sender_id: senderId, body });
      if (error) throw error;
      // Обновляем updated_at тикета, чтобы он поднимался в очереди
      // владельца при новом сообщении с любой стороны (само значение
      // перезапишет триггер set_updated_at, важен сам факт UPDATE).
      await supabase.from('support_tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticketId);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['support-tickets', 'messages', vars.ticketId] });
    },
  });
}

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TicketStatus }) => {
      const { error } = await supabase.from('support_tickets').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
    },
  });
}
