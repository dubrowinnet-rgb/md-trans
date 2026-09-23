import { useEffect, useState } from 'react';

// Текущее время, обновляется раз в минуту — для линии «сейчас» и серых прошедших заказов.
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
