import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { isMissingTableError } from './companies';

// support_tickets/support_ticket_messages ещё не в сгенерированных типах —
// см. одноимённый комментарий в api/companies.ts.
const db = supabase as unknown as SupabaseClient;

// support_tickets/support_ticket_messages — тоже часть предложенной схемы
// в памяти owner-console-feature, ещё не в боевой базе. См.
// isMissingTableError в api/companies.ts.
export type TicketStatus = 'open' | 'in_progress' | 'resolved';

export interface SupportTicket {
  id: string;
  company_id: string;
  created_by: string;
  subject: string;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

// Обращения текущего администратора («Техподдержка» в панели администратора).
export function useMyTickets(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['support-tickets', 'mine', employeeId],
    enabled: Boolean(employeeId),
    queryFn: async (): Promise<{ tickets: SupportTicket[]; missingTable: boolean }> => {
      const { data, error } = await db
        .from('support_tickets')
        .select('*')
        .eq('created_by', employeeId as string)
        .order('updated_at', { ascending: false });
      if (error) {
        if (isMissingTableError(error)) return { tickets: [], missingTable: true };
        throw error;
      }
      return { tickets: data as SupportTicket[], missingTable: false };
    },
  });
}

// Очередь обращений для владельца сервиса — по всем компаниям сразу.
export function useAllTickets() {
  return useQuery({
    queryKey: ['support-tickets', 'all'],
    queryFn: async (): Promise<{ tickets: (SupportTicket & { companyName: string })[]; missingTable: boolean }> => {
      const { data, error } = await db
        .from('support_tickets')
        .select('*, companies(name)')
        .order('updated_at', { ascending: false });
      if (error) {
        if (isMissingTableError(error)) return { tickets: [], missingTable: true };
        throw error;
      }
      const rows = data as (SupportTicket & { companies: { name: string } | null })[];
      return { tickets: rows.map((r) => ({ ...r, companyName: r.companies?.name ?? '—' })), missingTable: false };
    },
  });
}

export function useTicketMessages(ticketId: string | null) {
  return useQuery({
    queryKey: ['support-tickets', 'messages', ticketId],
    enabled: Boolean(ticketId),
    queryFn: async () => {
      const { data, error } = await db
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
      const { data: ticket, error } = await db
        .from('support_tickets')
        .insert({ company_id: companyId, created_by: employeeId, subject, status: 'open' })
        .select()
        .single();
      if (error) throw error;
      const { error: msgError } = await db
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
      const { error } = await db.from('support_ticket_messages').insert({ ticket_id: ticketId, sender_id: senderId, body });
      if (error) throw error;
      // Обновляем updated_at тикета, чтобы он поднимался в очереди
      // владельца при новом сообщении с любой стороны.
      await db.from('support_tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticketId);
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
      const { error } = await db.from('support_tickets').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
    },
  });
}
