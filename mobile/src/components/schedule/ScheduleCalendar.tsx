import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Dialog,
  Divider,
  HelperText,
  IconButton,
  Portal,
  SegmentedButtons,
  Surface,
  Text,
  TouchableRipple,
} from 'react-native-paper';
import type { ScheduleDayStatus, ScheduleMode } from '../../types/database';
import {
  dateToTimeString,
  effectiveScheduleStatus,
  formatTimeShort,
  timeStringToDate,
  toDateKey,
  useClearScheduleDay,
  useEmployeeScheduleDays,
  useSetScheduleDay,
  type ScheduleDay,
} from '../../api/schedule';
import { DateTimeField } from '../form/DateTimeField';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTH_LABELS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // приводим к неделе с понедельника
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function atHour(hour: number) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
}

type Clipboard = { sourceDay: string; row: ScheduleDay | null; op: 'copy' | 'move' };

// Календарь графика одного сотрудника («рабочий график»): день без отметки
// считается рабочим или выходным по умолчанию — решает employees.
// schedule_mode (mode проп). Тап по дню открывает диалог: рабочий/выходной,
// опционально часы, и копировать/перенести на другой день. Общий для
// экрана диспетчера/админа (canEdit = право редактировать заказы, режим
// только смотрит) и самообслуживания сотрудника (canEdit и canEditMode —
// оба только при can_manage_own_schedule).
export function ScheduleCalendar({
  employeeId,
  mode,
  canEdit,
  canEditMode,
  onSetMode,
}: {
  employeeId: string;
  mode: ScheduleMode;
  canEdit: boolean;
  canEditMode?: boolean;
  onSetMode?: (mode: ScheduleMode) => void;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const daysQuery = useEmployeeScheduleDays(employeeId);
  const days = daysQuery.data ?? new Map<string, ScheduleDay>();
  const setDay = useSetScheduleDay();
  const clearDay = useClearScheduleDay();
  const busy = setDay.isPending || clearDay.isPending;

  const [editingDay, setEditingDay] = useState<Date | null>(null);
  const [dialogStatus, setDialogStatus] = useState<ScheduleDayStatus>('on');
  const [dialogHasHours, setDialogHasHours] = useState(false);
  const [dialogStart, setDialogStart] = useState(() => atHour(9));
  const [dialogEnd, setDialogEnd] = useState(() => atHour(18));
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);

  const weeks = monthGrid(cursor.getFullYear(), cursor.getMonth());
  const todayKey = toDateKey(today);
  const editingKey = editingDay ? toDateKey(editingDay) : null;
  const editingHasRow = editingKey ? days.has(editingKey) : false;

  const openDialogFor = (date: Date) => {
    const row = days.get(toDateKey(date));
    const status = effectiveScheduleStatus(mode, row);
    setDialogStatus(status);
    setDialogHasHours(Boolean(row?.start_time && row?.end_time));
    setDialogStart(row?.start_time ? timeStringToDate(row.start_time) : atHour(9));
    setDialogEnd(row?.end_time ? timeStringToDate(row.end_time) : atHour(18));
    setEditingDay(date);
  };

  const applyToDay = (targetKey: string, row: ScheduleDay | null) => {
    if (row) {
      setDay.mutate({ employeeId, day: targetKey, status: row.status, startTime: row.start_time, endTime: row.end_time });
    } else {
      clearDay.mutate({ employeeId, day: targetKey });
    }
  };

  const handlePress = (date: Date) => {
    if (!canEdit || busy) return;
    const key = toDateKey(date);
    if (clipboard) {
      applyToDay(key, clipboard.row);
      if (clipboard.op === 'move') {
        if (key !== clipboard.sourceDay) clearDay.mutate({ employeeId, day: clipboard.sourceDay });
        setClipboard(null);
      }
      return;
    }
    openDialogFor(date);
  };

  const closeDialog = () => setEditingDay(null);

  const handleSave = () => {
    if (!editingKey) return;
    if (dialogStatus === 'off') {
      setDay.mutate({ employeeId, day: editingKey, status: 'off' });
    } else {
      setDay.mutate({
        employeeId,
        day: editingKey,
        status: 'on',
        startTime: dialogHasHours ? dateToTimeString(dialogStart) : null,
        endTime: dialogHasHours ? dateToTimeString(dialogEnd) : null,
      });
    }
    closeDialog();
  };

  const handleReset = () => {
    if (!editingKey) return;
    clearDay.mutate({ employeeId, day: editingKey });
    closeDialog();
  };

  const armClipboard = (op: 'copy' | 'move') => {
    if (!editingKey) return;
    const row = days.get(editingKey) ?? null;
    setClipboard({ sourceDay: editingKey, row, op });
    closeDialog();
  };

  return (
    <View>
      {canEditMode ? (
        <>
          <SegmentedButtons
            value={mode}
            onValueChange={(v) => onSetMode?.(v as ScheduleMode)}
            buttons={[
              { value: 'mark_off', label: 'Отмечаю выходные' },
              { value: 'mark_on', label: 'Отмечаю рабочие' },
            ]}
          />
          <HelperText type="info">
            Уже отмеченные дни не изменятся — режим решает только дни без отметки.
          </HelperText>
        </>
      ) : (
        <Text variant="bodySmall" style={styles.muted}>
          Режим сотрудника: {mode === 'mark_on' ? 'отмечает рабочие дни' : 'отмечает выходные'}
        </Text>
      )}

      {clipboard && (
        <Surface style={styles.clipboardBanner} elevation={1}>
          <Text variant="bodySmall" style={styles.flex}>
            {clipboard.op === 'move' ? 'Перенос' : 'Копирование'}
            {': нажмите на день, чтобы '}
            {clipboard.op === 'move' ? 'перенести туда' : 'вставить'}
          </Text>
          <Button compact onPress={() => setClipboard(null)}>
            Готово
          </Button>
        </Surface>
      )}

      <View style={styles.nav}>
        <IconButton
          icon="chevron-left"
          accessibilityLabel="Предыдущий месяц"
          onPress={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
        />
        <Text variant="titleMedium">{`${MONTH_LABELS[cursor.getMonth()]} ${cursor.getFullYear()}`}</Text>
        <IconButton
          icon="chevron-right"
          accessibilityLabel="Следующий месяц"
          onPress={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
        />
      </View>

      {daysQuery.isError && <HelperText type="error">{daysQuery.error.message}</HelperText>}
      {daysQuery.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((w) => (
              <Text key={w} variant="labelSmall" style={styles.weekday}>
                {w}
              </Text>
            ))}
          </View>
          {weeks.map((week, i) => (
            <View key={i} style={styles.weekRow}>
              {week.map((date, j) => {
                if (!date) return <View key={j} style={styles.cell} />;
                const key = toDateKey(date);
                const row = days.get(key);
                const status = effectiveScheduleStatus(mode, row);
                const hasHours = Boolean(row?.start_time && row?.end_time);
                const isToday = key === todayKey;
                const cellStyle =
                  status === 'off'
                    ? row
                      ? styles.cellOffExplicit
                      : styles.cellOffDefault
                    : hasHours
                      ? styles.cellOnHours
                      : row
                        ? styles.cellOnExplicit
                        : undefined;
                return (
                  <TouchableRipple
                    key={j}
                    style={[styles.cell, cellStyle]}
                    disabled={!canEdit}
                    onPress={() => handlePress(date)}
                    borderless
                  >
                    <View style={[styles.cellInner, isToday && styles.cellToday]}>
                      <Text variant="bodyMedium" style={status === 'off' ? styles.cellTextOff : undefined}>
                        {date.getDate()}
                      </Text>
                      {hasHours && row?.start_time && row?.end_time && (
                        <Text style={styles.cellHours}>{`${formatTimeShort(row.start_time)}–${formatTimeShort(row.end_time)}`}</Text>
                      )}
                    </View>
                  </TouchableRipple>
                );
              })}
            </View>
          ))}
          <Text variant="bodySmall" style={[styles.muted, styles.legend]}>
            Красный — выходной, зелёный — рабочий с указанными часами
            {canEdit ? '. Нажмите на день, чтобы отметить, задать часы или скопировать/перенести.' : '.'}
          </Text>
        </>
      )}

      <Portal>
        <Dialog visible={Boolean(editingDay)} onDismiss={closeDialog}>
          <Dialog.Title>
            {editingDay ? `${editingDay.getDate()} ${MONTH_LABELS[editingDay.getMonth()].toLowerCase()}` : ''}
          </Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            <SegmentedButtons
              value={dialogStatus}
              onValueChange={(v) => setDialogStatus(v as ScheduleDayStatus)}
              buttons={[
                { value: 'on', label: 'Рабочий' },
                { value: 'off', label: 'Выходной' },
              ]}
            />
            {dialogStatus === 'on' && (
              <>
                <View style={styles.row}>
                  <Button
                    mode={dialogHasHours ? 'outlined' : 'contained-tonal'}
                    compact
                    onPress={() => setDialogHasHours(false)}
                  >
                    Весь день
                  </Button>
                  <Button
                    mode={dialogHasHours ? 'contained-tonal' : 'outlined'}
                    compact
                    onPress={() => setDialogHasHours(true)}
                  >
                    По часам
                  </Button>
                </View>
                {dialogHasHours && (
                  <View style={styles.row}>
                    <DateTimeField label="С" mode="time" value={dialogStart} onChange={setDialogStart} />
                    <DateTimeField label="До" mode="time" value={dialogEnd} onChange={setDialogEnd} />
                  </View>
                )}
              </>
            )}
            {(setDay.error ?? clearDay.error) && (
              <HelperText type="error">{(setDay.error ?? clearDay.error)?.message}</HelperText>
            )}
            <Divider />
            <View style={styles.row}>
              <Button compact icon="content-copy" onPress={() => armClipboard('copy')}>
                Копировать
              </Button>
              <Button compact icon="swap-horizontal" onPress={() => armClipboard('move')}>
                Перенести
              </Button>
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            {editingHasRow && <Button onPress={handleReset}>Сбросить</Button>}
            <Button onPress={closeDialog}>Отмена</Button>
            <Button mode="contained" onPress={handleSave} loading={busy} disabled={busy}>
              Сохранить
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  loader: {
    marginTop: 24,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    opacity: 0.6,
    paddingVertical: 4,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 2,
    borderRadius: 8,
  },
  cellInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  cellToday: {
    borderWidth: 1.5,
    borderColor: '#5b21b6',
  },
  cellOffExplicit: {
    backgroundColor: '#fecaca',
  },
  cellOffDefault: {
    backgroundColor: '#fee2e2',
  },
  cellOnExplicit: {
    backgroundColor: '#bbf7d0',
  },
  cellOnHours: {
    backgroundColor: '#86efac',
  },
  cellTextOff: {
    color: '#b91c1c',
  },
  cellHours: {
    fontSize: 8,
    lineHeight: 9,
    color: '#166534',
  },
  legend: {
    marginTop: 8,
    paddingHorizontal: 4,
  },
  muted: {
    opacity: 0.7,
  },
  clipboardBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingLeft: 12,
    marginBottom: 8,
  },
  dialogContent: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
});
