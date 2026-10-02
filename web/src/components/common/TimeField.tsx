'use client';

import { TimePicker } from '@mantine/dates';

// Время всегда в 24-часовом формате, независимо от языка браузера
// (обычный <input type="time"> в английском Chrome показывает AM/PM).
export function TimeField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <TimePicker
      label={label}
      value={value}
      onChange={(v) => {
        if (!v) return;
        onChange(v.slice(0, 5));
        // Закрываем выпадающий список сразу после выбора часа или минут —
        // по одному значению за раз, как и в выборе услуг (Максим,
        // «доработки 3»): TimePicker сам не закрывается по клику
        // (`@mantine/dates`, закрытие только по blur), нужно ещё нажатие
        // на поле, если нужно поправить второе значение. Дать событию
        // клика сперва доотработать (оно само возвращает фокус на
        // часы/минуты), а потом снять фокус — так же, как закрывает клик
        // мимо.
        requestAnimationFrame(() => {
          (document.activeElement as HTMLElement | null)?.blur();
        });
      }}
      format="24h"
      withDropdown
      minutesStep={5}
      error={error}
      popoverProps={{ zIndex: 500 }}
    />
  );
}
