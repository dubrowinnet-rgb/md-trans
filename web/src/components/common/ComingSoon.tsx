import { Alert } from '@mantine/core';
import { IconClockHour4 } from '@tabler/icons-react';

// Общий баннер для страниц, чьи таблицы ещё не пришли из миграции
// мобильного треда (владелец сервиса, техподдержка) — см. isMissingTableError
// в api/companies.ts и память owner-console-feature.
export function ComingSoon({ text }: { text: string }) {
  return (
    <Alert icon={<IconClockHour4 size={18} />} color="grape" variant="light">
      {text}
    </Alert>
  );
}
