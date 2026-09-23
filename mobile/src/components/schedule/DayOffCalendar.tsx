import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, HelperText, IconButton, Text, TouchableRipple } from 'react-native-paper';
import { toDateKey, useEmployeeDaysOff, useToggleDayOff } from '../../api/schedule';

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

// Календарь выходных одного сотрудника (раздел «рабочий график»): по
// умолчанию все дни рабочие, тап по дню ставит/снимает выходной. Общий для
// экрана диспетчера/админа (правит любого) и самообслуживания сотрудника
// (canEdit только при can_manage_own_schedule).
export function DayOffCalendar({ employeeId, canEdit }: { employeeId: string; canEdit: boolean }) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const daysOffQuery = useEmployeeDaysOff(employeeId);
  const toggleDayOff = useToggleDayOff();
  const daysOff = daysOffQuery.data ?? new Set<string>();

  const weeks = monthGrid(cursor.getFullYear(), cursor.getMonth());
  const todayKey = toDateKey(today);

  const handlePress = (date: Date) => {
    if (!canEdit || toggleDayOff.isPending) return;
    const key = toDateKey(date);
    toggleDayOff.mutate({ employeeId, day: key, isOff: !daysOff.has(key) });
  };

  return (
    <View>
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

      {daysOffQuery.isError && <HelperText type="error">{daysOffQuery.error.message}</HelperText>}
      {daysOffQuery.isLoading ? (
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
                const isOff = daysOff.has(key);
                const isToday = key === todayKey;
                return (
                  <TouchableRipple
                    key={j}
                    style={[styles.cell, isOff && styles.cellOff]}
                    disabled={!canEdit}
                    onPress={() => handlePress(date)}
                    borderless
                  >
                    <View style={[styles.cellInner, isToday && styles.cellToday]}>
                      <Text variant="bodyMedium" style={isOff ? styles.cellTextOff : undefined}>
                        {date.getDate()}
                      </Text>
                    </View>
                  </TouchableRipple>
                );
              })}
            </View>
          ))}
          <View style={styles.legend}>
            <View style={[styles.legendDot, styles.cellOff]} />
            <Text variant="bodySmall" style={styles.muted}>
              выходной{canEdit ? ' · нажмите на день, чтобы поставить или снять' : ''}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  cellOff: {
    backgroundColor: '#fee2e2',
  },
  cellTextOff: {
    color: '#b91c1c',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  legendDot: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  muted: {
    opacity: 0.7,
  },
});
