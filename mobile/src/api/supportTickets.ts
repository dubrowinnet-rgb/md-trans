import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

export type SupportTicket = Database['public']['Tables']['support_tickets']['Row'];
export type SupportTicketMessage = Database['public']['Tables']['support_ticket_messages']['Row'];

// Обращения администратора к владельцу сервиса («Техподдержка» в
// Настройках — доработка «владелец сервиса», 2026-09-25). Кнопка есть
// только у администратора, поэтому и обращения — только свои, RLS этого
// не даст поменять. Полная очередь по всем компаниям и управление
// статусом — в кабинете владельца (веб).
export function useMyTickets(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ['support-tickets', 'mine', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('company_id', companyId as string)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as SupportTicket[];
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

// Заводит обращение и его первое сообщение двумя запросами подряд — как и
// в веб-кабинете, без Edge Function атомарность не сделать, для обращения
// в поддержку это не критично.
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
        .insert({ company_id: companyId, created_by: employeeId, subject })
        .select()
        .single();
      if (error) throw error;
      const { error: msgError } = await supabase
        .from('support_ticket_messages')
        .insert({ ticket_id: ticket.id, sender_id: employeeId, body });
      if (msgError) throw msgError;
      return ticket as SupportTicket;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['support-tickets'] }),
  });
}

export function useSendTicketMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, senderId, body }: { ticketId: string; senderId: string; body: string }) => {
      const { error } = await supabase.from('support_ticket_messages').insert({ ticket_id: ticketId, sender_id: senderId, body });
      if (error) throw error;
      // Поднимаем тикет в списке при новом сообщении с любой стороны —
      // как и в веб-кабинете (там же почему без триггера: обновляем явно).
      await supabase.from('support_tickets').update({ updated_at: new Date().toISOString() }).eq('id', ticketId);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['support-tickets', 'messages', vars.ticketId] });
    },
  });
}
