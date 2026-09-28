'use client';

import { useState } from 'react';
import { Alert, Button, Group, Stack, Text, Textarea } from '@mantine/core';
import { IconCircleCheck, IconMessageX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { errorMessage } from '@/lib/errors';
import { useApproveDriverReport, useRejectDriverReport, type DriverReport } from '@/api/driverReports';
import { formatReportStamp } from '@/components/driverReports/DriverReportTimes';

// Проверка отчёта администратором/диспетчером. Сам отчёт они не меняют
// (Максим, 2026-09-28): только согласуют или «не согласуют» с
// комментарием — тогда водитель исправляет и отправляет отчёт заново.
// Последнее несогласование база хранит и после повторной отправки (0019),
// поэтому оно видно как история и у исправленного, и у согласованного.
export function DriverReportReview({ report, namesById }: { report: DriverReport; namesById: Map<string, string> }) {
  const approve = useApproveDriverReport();
  const reject = useRejectDriverReport();
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState('');

  const rejectedLine = [
    report.rejected_by ? namesById.get(report.rejected_by) : undefined,
    report.rejected_at ? formatReportStamp(report.rejected_at) : null,
  ]
    .filter(Boolean)
    .join(', ');
  const approvedBy = report.confirmed_by ? namesById.get(report.confirmed_by) : undefined;
  const hadRejection = Boolean(report.rejected_at && report.rejection_comment);

  const doApprove = async () => {
    try {
      await approve.mutateAsync(report.id);
      notifications.show({ message: 'Отчёт согласован', color: 'green' });
    } catch (err) {
      notifications.show({ message: errorMessage(err, 'Не удалось согласовать отчёт'), color: 'red' });
    }
  };

  const doReject = async () => {
    const text = comment.trim();
    if (!text) return;
    try {
      await reject.mutateAsync({ report, comment: text });
      setRejecting(false);
      setComment('');
      notifications.show({ message: 'Отчёт не согласован — водитель получит уведомление', color: 'orange' });
    } catch (err) {
      notifications.show({ message: errorMessage(err, 'Не удалось отправить комментарий'), color: 'red' });
    }
  };

  return (
    <Stack gap="xs">
      {report.status === 'confirmed' && (
        <Alert color="green" icon={<IconCircleCheck size={18} />} py="xs">
          Согласован{approvedBy ? ` — ${approvedBy}` : ''}
          {report.confirmed_at ? `, ${formatReportStamp(report.confirmed_at)}` : ''}. Зафиксирован в финансовых
          отчётах.
          {hadRejection && (
            <Text size="xs" c="dimmed" mt={4}>
              До этого был не согласован: «{report.rejection_comment}»{rejectedLine ? ` (${rejectedLine})` : ''}
            </Text>
          )}
        </Alert>
      )}

      {report.status === 'rejected' && (
        <Alert color="red" icon={<IconMessageX size={18} />} title="Не согласован — ждём исправления от водителя" py="xs">
          <Text size="sm">{report.rejection_comment}</Text>
          {rejectedLine && (
            <Text size="xs" c="dimmed" mt={4}>
              {rejectedLine}
            </Text>
          )}
        </Alert>
      )}

      {report.status === 'submitted' && hadRejection && (
        <Alert color="orange" variant="light" py="xs" title="Был не согласован — водитель исправил и отправил заново">
          <Text size="sm">«{report.rejection_comment}»</Text>
          {rejectedLine && (
            <Text size="xs" c="dimmed" mt={4}>
              {rejectedLine}
            </Text>
          )}
        </Alert>
      )}

      {report.status === 'submitted' && rejecting && (
        <Stack gap="xs">
          <Textarea
            label="Что нужно исправить"
            description="Водитель получит уведомление, увидит комментарий у себя в отчётах, исправит и отправит заново"
            placeholder="Например: не указан расход на парковку"
            autosize
            minRows={2}
            maxRows={6}
            maxLength={1000}
            required
            autoFocus
            value={comment}
            onChange={(e) => setComment(e.currentTarget.value)}
          />
          <Group justify="flex-end" gap="xs">
            <Button
              variant="default"
              onClick={() => {
                setRejecting(false);
                setComment('');
              }}
            >
              Отмена
            </Button>
            <Button color="red" onClick={doReject} loading={reject.isPending} disabled={!comment.trim()}>
              Не согласовать
            </Button>
          </Group>
        </Stack>
      )}

      {report.status === 'submitted' && !rejecting && (
        <Group justify="flex-end" gap="xs">
          <Button variant="light" color="red" leftSection={<IconMessageX size={16} />} onClick={() => setRejecting(true)}>
            Не согласовать
          </Button>
          <Button leftSection={<IconCircleCheck size={16} />} onClick={doApprove} loading={approve.isPending}>
            Согласовать
          </Button>
        </Group>
      )}
    </Stack>
  );
}
