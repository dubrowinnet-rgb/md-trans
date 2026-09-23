import { useCallback, useMemo, useState } from 'react';
import { addDays, startOfDay, startOfWeek } from '../utils/date';

export type DaysMode = 1 | 3 | 7;

// Сколько страниц календарь держит отрисованными слева и справа от текущей.
export const PAGES_AROUND = 2;

export function alignToMode(date: Date, mode: DaysMode) {
  return mode === 7 ? startOfWeek(date, { weekStartsOn: 1 }) : startOfDay(date);
}

// Состояние календаря: режим 1/3/7 дней и первый видимый день страницы.
// Заказы грузим на все отрисованные страницы, чтобы листание не ждало сети.
export function useCalendarNav() {
  const [mode, setModeState] = useState<DaysMode>(3);
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  // Счётчик запросов «прокрутить к текущему времени» (кнопка «Сегодня»).
  const [nowSignal, setNowSignal] = useState(0);

  const { rangeStart, rangeEnd } = useMemo(
    () => ({
      rangeStart: addDays(anchor, -PAGES_AROUND * mode),
      rangeEnd: addDays(anchor, (PAGES_AROUND + 1) * mode),
    }),
    [anchor, mode]
  );

  // Если на экране был сегодняшний день, после смены режима он остаётся на экране.
  const setMode = useCallback(
    (next: DaysMode) => {
      const today = startOfDay(new Date());
      const showsToday = today >= anchor && today < addDays(anchor, mode);
      setModeState(next);
      setAnchor(alignToMode(showsToday ? today : anchor, next));
    },
    [anchor, mode]
  );

  const goPrev = useCallback(() => setAnchor((a) => addDays(a, -mode)), [mode]);
  const goNext = useCallback(() => setAnchor((a) => addDays(a, mode)), [mode]);
  const goToday = useCallback(() => {
    setAnchor(alignToMode(new Date(), mode));
    setNowSignal((n) => n + 1);
  }, [mode]);

  return { mode, setMode, anchor, setAnchor, rangeStart, rangeEnd, goPrev, goNext, goToday, nowSignal };
}
