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
// minAnchor (доработки 2, п.1) — у водителя/грузчика назад листать можно
// только в пределах текущего календарного месяца; у диспетчера/админа
// параметр не передаётся, и ограничения нет.
export function useCalendarNav(options?: { minAnchor?: Date }) {
  const minAnchor = options?.minAnchor;
  const [mode, setModeState] = useState<DaysMode>(3);
  const [anchor, setAnchorState] = useState(() => startOfDay(new Date()));

  const clampAnchor = useCallback(
    (date: Date, forMode: DaysMode) => {
      const aligned = alignToMode(date, forMode);
      if (minAnchor && aligned < minAnchor) return alignToMode(minAnchor, forMode);
      return aligned;
    },
    [minAnchor]
  );

  const setAnchor = useCallback((date: Date) => setAnchorState(clampAnchor(date, mode)), [clampAnchor, mode]);
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
      setAnchorState(clampAnchor(showsToday ? today : anchor, next));
    },
    [anchor, mode, clampAnchor]
  );

  const goPrev = useCallback(() => setAnchorState((a) => clampAnchor(addDays(a, -mode), mode)), [mode, clampAnchor]);
  const goNext = useCallback(() => setAnchorState((a) => clampAnchor(addDays(a, mode), mode)), [mode, clampAnchor]);
  const goToday = useCallback(() => {
    setAnchorState(clampAnchor(new Date(), mode));
    setNowSignal((n) => n + 1);
  }, [mode, clampAnchor]);

  const atMinAnchor = Boolean(minAnchor) && anchor <= clampAnchor(minAnchor as Date, mode);

  return { mode, setMode, anchor, setAnchor, rangeStart, rangeEnd, goPrev, goNext, goToday, nowSignal, atMinAnchor };
}
