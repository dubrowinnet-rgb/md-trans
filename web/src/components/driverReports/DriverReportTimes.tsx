'use client';

import { Stack, Text } from '@mantine/core';
import { dayjs } from '@/lib/dates';
import { reportEditedAt, reportWrittenAt, type DriverReport } from '@/api/driverReports';

// «28 сентября в 21:14»; год — только если не текущий.
export function formatReportStamp(value: string) {
  const d = dayjs(value);
  return d.format(d.year() === dayjs().year() ? 'D MMMM [в] HH:mm' : 'D MMMM YYYY [в] HH:mm');
}

// Когда водитель написал отчёт и, отдельной строкой, когда правил его сам
// (Максим, 2026-09-28: «дополнительная строчка с временем редактирования,
// если таковое было со стороны водителя»).
export function DriverReportTimes({ report }: { report: DriverReport }) {
  const editedAt = reportEditedAt(report);
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        Написан {formatReportStamp(reportWrittenAt(report))}
      </Text>
      {editedAt && (
        <Text size="xs" c="orange.8">
          Изменён водителем {formatReportStamp(editedAt)}
        </Text>
      )}
    </Stack>
  );
}
