'use client';

import { Alert, Badge, Group, Modal, Stack, Title } from '@mantine/core';
import { formatDate } from '@/lib/dates';
import { DRIVER_REPORT_STATUS_COLORS, DRIVER_REPORT_STATUS_LABELS } from '@/lib/labels';
import type { DriverReport } from '@/api/driverReports';
import { DriverReportBody } from '@/components/driverReports/DriverReportBody';
import { DriverReportTimes } from '@/components/driverReports/DriverReportTimes';
import { DriverReportReview } from '@/components/driverReports/DriverReportReview';

// Один отчёт из таблицы — то же содержимое и те же действия, что у
// карточки в ленте (DriverReportFeed).
export function DriverReportDetailModal({
  report,
  namesById,
  currentEmployeeId,
  onClose,
}: {
  report: DriverReport;
  namesById: Map<string, string>;
  currentEmployeeId: string;
  onClose: () => void;
}) {
  return (
    <Modal
      opened
      onClose={onClose}
      size="lg"
      title={
        <Group gap="xs" component="span">
          <Title order={4} component="span">
            {namesById.get(report.employee_id) ?? '—'} · {formatDate(report.report_date)}
          </Title>
          <Badge component="span" color={DRIVER_REPORT_STATUS_COLORS[report.status]}>
            {DRIVER_REPORT_STATUS_LABELS[report.status]}
          </Badge>
        </Group>
      }
    >
      <Stack>
        {report.status !== 'draft' && <DriverReportTimes report={report} />}
        <DriverReportBody report={report} />
        {report.status === 'draft' && <Alert color="gray">Водитель ещё заполняет отчёт — подтверждать пока нечего.</Alert>}
        <DriverReportReview report={report} namesById={namesById} currentEmployeeId={currentEmployeeId} />
      </Stack>
    </Modal>
  );
}
