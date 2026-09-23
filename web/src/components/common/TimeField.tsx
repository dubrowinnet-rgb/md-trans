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
      onChange={(v) => v && onChange(v.slice(0, 5))}
      format="24h"
      withDropdown
      minutesStep={5}
      error={error}
      popoverProps={{ zIndex: 500 }}
    />
  );
}
