import { useMemo, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ActivityIndicator, Appbar, Button, Divider, List, Menu, Text, TextInput } from 'react-native-paper';
import {
  useCompanyTickets,
  useSendTicketMessage,
  useSetTicketStatus,
  useTicketMessages,
  type EmployeeSupportTicket,
  type EmployeeSupportTicketWithSender,
} from '../../api/employeeSupport';
import { useSession } from '../../providers/SessionProvider';
import { TICKET_STATUS_LABELS } from '../../theme';

const SECTION_ORDER: EmployeeSupportTicket['status'][] = ['open', 'in_progress', 'resolved'];

// Очередь обращений сотрудников — админ/диспетчер (Максим, 01.10, вторая
// половина отложенного пункта «Правки 3» п.5), «Настройки» → «Обращения
// сотрудников». Отдельно от settings/support.tsx (туда админ пишет сам,
// владельцу сервиса) — здесь админ/диспетчер отвечает своим сотрудникам.
export default function EmployeeSupportInboxScreen() {
  const { employee } = useSession();
  // Пункт меню скрыт остальным ролям, но прямой переход по адресу это не
  // остановит — проверяем ещё раз здесь, как settings/support.tsx.
  if (!employee || (employee.role !== 'admin' && employee.role !== 'dispatcher')) {
    return (
      <View style={styles.noAccess}>
        <Text variant="bodyMedium">Недостаточно прав для просмотра обращений сотрудников.</Text>
      </View>
    );
  }
  return <InboxContent reviewerId={employee.id} />;
}

function InboxContent({ reviewerId }: { reviewerId: string }) {
  const ticketsQuery = useCompanyTickets();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sections = useMemo(() => {
    const byStatus = new Map<EmployeeSupportTicket['status'], EmployeeSupportTicketWithSender[]>();
    for (const t of ticketsQuery.data ?? []) {
      const list = byStatus.get(t.status);
      if (list) list.push(t);
      else byStatus.set(t.status, [t]);
    }
    return SECTION_ORDER.filter((s) => byStatus.has(s)).map((status) => ({
      title: TICKET_STATUS_LABELS[status],
      data: byStatus.get(status) as EmployeeSupportTicketWithSender[],
    }));
  }, [ticketsQuery.data]);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Обращения сотрудников" />
      </Appbar.Header>
      {ticketsQuery.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(t) => t.id}
          ItemSeparatorComponent={Divider}
          ListEmptyComponent={<Text style={styles.empty}>Обращений пока нет.</Text>}
          renderSectionHeader={({ section }) => (
            <Text variant="labelLarge" style={styles.sectionHeader}>
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => (
            <List.Accordion
              title={item.subject}
              description={item.employees?.name ?? 'Сотрудник'}
              expanded={expandedId === item.id}
              onPress={() => setExpandedId(expandedId === item.id ? null : item.id)}
            >
              <TicketThread ticket={item} reviewerId={reviewerId} />
            </List.Accordion>
          )}
        />
      )}
    </View>
  );
}

function TicketThread({ ticket, reviewerId }: { ticket: EmployeeSupportTicket; reviewerId: string }) {
  const messagesQuery = useTicketMessages(ticket.id);
  const sendMessage = useSendTicketMessage();
  const setStatus = useSetTicketStatus();
  const [draft, setDraft] = useState('');
  const [statusMenuVisible, setStatusMenuVisible] = useState(false);

  const send = async () => {
    if (!draft.trim()) return;
    await sendMessage.mutateAsync({ ticketId: ticket.id, senderId: reviewerId, body: draft.trim() });
    setDraft('');
  };

  return (
    <View style={styles.thread}>
      <Menu
        visible={statusMenuVisible}
        onDismiss={() => setStatusMenuVisible(false)}
        anchor={
          <Button mode="outlined" compact onPress={() => setStatusMenuVisible(true)} style={styles.statusButton}>
            Статус: {TICKET_STATUS_LABELS[ticket.status]}
          </Button>
        }
      >
        {SECTION_ORDER.map((status) => (
          <Menu.Item
            key={status}
            title={TICKET_STATUS_LABELS[status]}
            disabled={status === ticket.status}
            onPress={() => {
              setStatusMenuVisible(false);
              setStatus.mutate({ ticketId: ticket.id, status });
            }}
          />
        ))}
      </Menu>

      {messagesQuery.isLoading ? (
        <ActivityIndicator size="small" />
      ) : (messagesQuery.data ?? []).length === 0 ? (
        <Text variant="bodySmall" style={styles.muted}>
          Сообщений пока нет
        </Text>
      ) : (
        (messagesQuery.data ?? []).map((m) => (
          <View key={m.id} style={[styles.message, m.sender_id === reviewerId && styles.myMessage]}>
            <Text variant="bodySmall">{m.body}</Text>
          </View>
        ))
      )}
      <View style={styles.replyRow}>
        <TextInput
          mode="outlined"
          dense
          placeholder="Ответить..."
          accessibilityLabel="Ответить"
          value={draft}
          onChangeText={setDraft}
          style={styles.replyInput}
        />
        <Button mode="contained" onPress={send} loading={sendMessage.isPending} disabled={!draft.trim()}>
          Отправить
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    marginTop: 32,
  },
  empty: {
    textAlign: 'center',
    marginTop: 32,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    opacity: 0.6,
  },
  thread: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  statusButton: {
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  message: {
    backgroundColor: '#f4f4f5',
    borderRadius: 8,
    padding: 8,
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  myMessage: {
    backgroundColor: '#ede9fe',
    alignSelf: 'flex-end',
  },
  muted: {
    opacity: 0.6,
  },
  replyRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginTop: 4,
  },
  replyInput: {
    flex: 1,
  },
  noAccess: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
});
