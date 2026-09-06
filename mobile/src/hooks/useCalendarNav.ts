import { useMemo, useState } from 'react';
import { addDays, dayBounds, startOfDay, weekDays } from '../utils/date';

export type ViewMode = 'day' | 'week';

export function useCalendarNav() {
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));

  const days = useMemo(
    () => (viewMode === 'day' ? [anchorDate] : weekDays(anchorDate)),
    [viewMode, anchorDate]
  );
  const rangeStart = dayBounds(days[0]).start;
  const rangeEnd = dayBounds(days[days.length - 1]).end;

  const goToday = () => setAnchorDate(startOfDay(new Date()));
  const goPrev = () => setAnchorDate((d) => addDays(d, viewMode === 'day' ? -1 : -7));
  const goNext = () => setAnchorDate((d) => addDays(d, viewMode === 'day' ? 1 : 7));

  return { viewMode, setViewMode, anchorDate, days, rangeStart, rangeEnd, goToday, goPrev, goNext };
}
