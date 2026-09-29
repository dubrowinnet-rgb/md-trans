import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { addMonths, format, startOfMonth } from 'date-fns';
import { ActivityIndicator, Appbar, Button, HelperText, IconButton, Surface, Text, TextInput } from 'react-native-paper';
import {
  canAuthorEditReport,
  driverReportEditDeadline,
  useApproveDriverReport,
  useDriverReportFeed,
  useRejectDriverReport,
  type DriverReport,
} from '../../api/driverReports';
import { DriverReportCard, formatMoment, formatReportDay, rub } from '../../components/driverReports/DriverReportCard';
import { useSession } from '../../providers/SessionProvider';
import { formatHeaderDate } from '../../utils/date';

// Лента отчётов водителя (Максим, «Доработки 2», п. 1, 2026-09-28) — один и
// тот же экран у самого водителя и у администратора/диспетчера, как было в
// личных сообщениях соцсети: отчёты с начала месяца вниз до сегодняшнего
// дня, у каждого время отправки и, если водитель правил, время правки.
// Водитель видит только текущий месяц и правит отчёт 24 часа после отправки;
// проверяющий листает любой месяц, но отчёт не правит — только согласует
// или не согласует с комментарием. Правила проверяет база (миграция 0019).
export default function DriverFeedScreen() {
  const { employee } = useSession();
  const params = useLocalSearchParams<{ employeeId?: string; name?: string }>();

  const isReviewer = employee?.role === 'admin' || employee?.role === 'dispatcher';
  const targetId = params.employeeId ?? employee?.id;
  const isAuthor = employee?.role === 'driver' && targetId === employee.id;

  if (!employee || !targetId || (!isAuthor && !isReviewer)) {
    return (
      <View style={styles.noAccess}>
        <Text variant="bodyMedium">Раздел доступен водителю, администратору и диспетчеру.</Text>
      </View>
    );
  }

  return isAuthor ? <AuthorFeed employeeId={employee.id} /> : <ReviewerFeed employeeId={targetId} name={params.name ?? 'Водитель'} />;
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Заголовок в две строки — как на календаре сотрудника: subtitle у
// Appbar.Content в Paper v5 устарел и в теме MD3 не рисуется.
function HeaderTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View>
      <Text variant="titleMedium" numberOfLines={1}>
        {title}
      </Text>
      <Text variant="bodySmall" style={styles.muted}>
        {subtitle}
      </Text>
    </View>
  );
}

function FeedScroll({
  children,
  scrollRef: externalRef,
  onViewportHeight,
}: {
  children: React.ReactNode;
  scrollRef?: React.RefObject<ScrollView | null>;
  onViewportHeight?: (height: number) => void;
}) {
  const ownRef = useRef<ScrollView>(null);
  const scrollRef = externalRef ?? ownRef;
  const scrolledRef = useRef(false);
  // Как в переписке: открываем ленту внизу, на последних отчётах.
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.feed}
        keyboardShouldPersistTaps="handled"
        onLayout={(e) => onViewportHeight?.(e.nativeEvent.layout.height)}
        onContentSizeChange={() => {
          if (scrolledRef.current) return;
          scrolledRef.current = true;
          scrollRef.current?.scrollToEnd({ animated: false });
        }}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AuthorFeed({ employeeId }: { employeeId: string }) {
  const feedQuery = useDriverReportFeed(employeeId);
  const reports = feedQuery.data ?? [];
  const sent = reports.filter((r) => r.status !== 'draft');
  const drafts = reports.filter((r) => r.status === 'draft');
  const now = new Date();

  const openForm = (date?: string) => router.push(date ? `/settings/driver-report?date=${date}` : '/settings/driver-report');

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={<HeaderTitle title="Мои отчёты" subtitle={capitalize(formatHeaderDate(now))} />} />
      </Appbar.Header>

      {feedQuery.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <FeedScroll>
          <Text variant="bodySmall" style={styles.caption}>
            Отчёты за текущий месяц. Эту же ленту видят администратор и диспетчер. Исправить отчёт можно в течение 24 часов после отправки.
          </Text>
          {feedQuery.isError && <HelperText type="error">{feedQuery.error.message}</HelperText>}
          {sent.length === 0 && !feedQuery.isError && (
            <Text style={styles.empty}>В этом месяце отчётов пока нет.</Text>
          )}
          {sent.map((report) => (
            <DriverReportCard key={report.id} report={report} actions={<AuthorActions report={report} now={now} onEdit={() => openForm(report.report_date)} />} />
          ))}
          {drafts.map((draft) => (
            <Surface key={draft.id} style={styles.draft} elevation={0}>
              <Text variant="bodyMedium" style={styles.flex}>
                {`Черновик за ${formatReportDay(draft.report_date, false)} не отправлен`}
              </Text>
              <Button mode="text" onPress={() => openForm(draft.report_date)}>
                Продолжить
              </Button>
            </Surface>
          ))}
        </FeedScroll>
      )}

      <View style={styles.bottomBar}>
        <Button mode="contained" icon="pencil-plus-outline" onPress={() => openForm()}>
          Написать отчёт
        </Button>
      </View>
    </View>
  );
}

function AuthorActions({ report, now, onEdit }: { report: DriverReport; now: Date; onEdit: () => void }) {
  if (report.status === 'rejected') {
    return (
      <Button mode="contained" icon="pencil-outline" onPress={onEdit}>
        Исправить и отправить заново
      </Button>
    );
  }
  if (!canAuthorEditReport(report, now)) return null;
  const deadline = driverReportEditDeadline(report);
  return (
    <View style={styles.editRow}>
      <Button mode="outlined" icon="pencil-outline" onPress={onEdit}>
        Исправить
      </Button>
      {deadline && (
        <Text variant="bodySmall" style={styles.muted}>
          {`можно до ${formatMoment(deadline.toISOString())}`}
        </Text>
      )}
    </View>
  );
}

function ReviewerFeed({ employeeId, name }: { employeeId: string; name: string }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const range = useMemo(
    () => ({ start: format(month, 'yyyy-MM-dd'), end: format(addMonths(month, 1), 'yyyy-MM-dd') }),
    [month]
  );
  const feedQuery = useDriverReportFeed(employeeId, range);
  const reports = feedQuery.data ?? [];
  const isCurrentMonth = month.getTime() >= startOfMonth(new Date()).getTime();
  const pending = reports.filter((r) => r.status === 'submitted').length;
  const handedIn = reports.reduce((sum, r) => sum + (r.cash_handed_in ?? 0), 0);

  // Поле замечания открывается внутри карточки, и клавиатура iPhone может его
  // закрыть: держим низ этой карточки в видимой части ленты — и когда
  // карточка выросла, и когда лента сжалась под клавиатуру.
  const scrollRef = useRef<ScrollView>(null);
  const viewportHeight = useRef(0);
  const cardLayouts = useRef(new Map<string, { y: number; height: number }>());
  const rejectingId = useRef<string | null>(null);
  const revealRejecting = () => {
    const layout = rejectingId.current ? cardLayouts.current.get(rejectingId.current) : undefined;
    if (!layout || viewportHeight.current === 0) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, layout.y + layout.height - viewportHeight.current + 12), animated: true });
  };

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={<HeaderTitle title={name} subtitle="Отчёты водителя" />} />
      </Appbar.Header>

      <View style={styles.monthRow}>
        <IconButton icon="chevron-left" accessibilityLabel="Предыдущий месяц" onPress={() => setMonth((m) => addMonths(m, -1))} />
        <Text variant="titleMedium" style={styles.monthLabel}>
          {formatHeaderDate(month)}
        </Text>
        <IconButton
          icon="chevron-right"
          accessibilityLabel="Следующий месяц"
          disabled={isCurrentMonth}
          onPress={() => setMonth((m) => addMonths(m, 1))}
        />
      </View>
      <Text variant="bodySmall" style={styles.summary}>
        {`На проверке: ${pending} · сдано за месяц: ${rub(handedIn)}`}
      </Text>

      {feedQuery.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <FeedScroll
          key={range.start}
          scrollRef={scrollRef}
          onViewportHeight={(height) => {
            viewportHeight.current = height;
            revealRejecting();
          }}
        >
          {feedQuery.isError && <HelperText type="error">{feedQuery.error.message}</HelperText>}
          {reports.length === 0 && !feedQuery.isError && <Text style={styles.empty}>За этот месяц отчётов нет.</Text>}
          {reports.map((report) => (
            <View
              key={report.id}
              onLayout={(e) => {
                cardLayouts.current.set(report.id, { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height });
                if (rejectingId.current === report.id) revealRejecting();
              }}
            >
              <DriverReportCard
                report={report}
                actions={
                  report.status === 'submitted' ? (
                    <ReviewActions
                      report={report}
                      onRejectingChange={(active) => {
                        rejectingId.current = active ? report.id : null;
                      }}
                    />
                  ) : undefined
                }
              />
            </View>
          ))}
        </FeedScroll>
      )}
    </View>
  );
}

// Проверяющий отчёт не правит: только согласовать или не согласовать с
// комментарием — тогда водитель исправляет и отправляет заново.
function ReviewActions({ report, onRejectingChange }: { report: DriverReport; onRejectingChange: (active: boolean) => void }) {
  const approve = useApproveDriverReport();
  const reject = useRejectDriverReport();
  const [rejecting, setRejectingState] = useState(false);
  const setRejecting = (active: boolean) => {
    onRejectingChange(active);
    setRejectingState(active);
  };
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const doApprove = async () => {
    setError(null);
    try {
      await approve.mutateAsync(report.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось согласовать отчёт');
    }
  };

  const doReject = async () => {
    setError(null);
    if (!comment.trim()) {
      setError('Напишите, что водителю нужно исправить');
      return;
    }
    try {
      await reject.mutateAsync({ report, comment: comment.trim() });
      setRejecting(false);
      setComment('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить замечание');
    }
  };

  if (rejecting) {
    return (
      <View style={styles.rejectBox}>
        <TextInput
          mode="outlined"
          label="Что нужно исправить"
          value={comment}
          onChangeText={setComment}
          multiline
          autoFocus
          maxLength={1000}
        />
        {error && <HelperText type="error">{error}</HelperText>}
        <View style={styles.editRow}>
          <Button mode="contained" buttonColor="#dc2626" onPress={doReject} loading={reject.isPending} disabled={reject.isPending}>
            Не согласовать
          </Button>
          <Button mode="text" onPress={() => { setRejecting(false); setError(null); }} disabled={reject.isPending}>
            Отмена
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.rejectBox}>
      <View style={styles.editRow}>
        <Button mode="contained" icon="check" onPress={doApprove} loading={approve.isPending} disabled={approve.isPending}>
          Согласовать
        </Button>
        <Button mode="outlined" icon="close" textColor="#dc2626" onPress={() => setRejecting(true)} disabled={approve.isPending}>
          Не согласовать
        </Button>
      </View>
      {error && <HelperText type="error">{error}</HelperText>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  loader: {
    marginTop: 32,
  },
  feed: {
    padding: 12,
    gap: 12,
    paddingBottom: 24,
  },
  caption: {
    opacity: 0.7,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  empty: {
    textAlign: 'center',
    marginTop: 24,
    opacity: 0.7,
  },
  draft: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#9ca3af',
    paddingLeft: 14,
    paddingVertical: 4,
  },
  bottomBar: {
    padding: 12,
    paddingBottom: 20,
  },
  editRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  muted: {
    opacity: 0.65,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    textTransform: 'capitalize',
    minWidth: 180,
    textAlign: 'center',
  },
  summary: {
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 4,
  },
  rejectBox: {
    flex: 1,
    gap: 8,
  },
  noAccess: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
});
