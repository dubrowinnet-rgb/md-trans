'use client';

import { useState } from 'react';
import { Alert, Button, Group, Stack, Text, Textarea } from '@mantine/core';
import { IconCircleCheck, IconMessageX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { errorMessage } from '@/lib/errors';
import {
  canRejectReport,
  useConfirmDriverReport,
  useRejectDriverReport,
  type DriverReport,
} from '@/api/driverReports';
import { formatReportStamp } from '@/components/driverReports/DriverReportTimes';

// Проверка отчёта администратором/диспетчером. Сам отчёт они не меняют
// (Максим, 2026-09-28): только подтверждают или «не согласуют» с
// комментарием — тогда водитель исправляет и отправляет отчёт заново.
export function DriverReportReview({
  report,
  namesById,
  currentEmployeeId,
}: {
  report: DriverReport;
  namesById: Map<string, string>;
  currentEmployeeId: string;
}) {
  const confirm = useConfirmDriverReport();
  const reject = useRejectDriverReport();
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState('');

  const reviewerName = report.reviewed_by ? namesById.get(report.reviewed_by) : undefined;
  const reviewedLine = [reviewerName, report.reviewed_at ? formatReportStamp(report.reviewed_at) : null]
    .filter(Boolean)
    .join(', ');

  const doConfirm = async () => {
    try {
      await confirm.mutateAsync({ id: report.id, confirmedBy: currentEmployeeId });
      notifications.show({ message: 'Отчёт и касса подтверждены', color: 'green' });
    } catch (err) {
      notifications.show({ message: errorMessage(err, 'Не удалось подтвердить отчёт'), color: 'red' });
    }
  };

  const doReject = async () => {
    const text = comment.trim();
    if (!text) return;
    try {
      await reject.mutateAsync({ id: report.id, reviewedBy: currentEmployeeId, comment: text });
      setRejecting(false);
      setComment('');
      notifications.show({ message: 'Отчёт не согласован — водитель увидит комментарий и исправит', color: 'orange' });
    } catch (err) {
      notifications.show({ message: errorMessage(err, 'Не удалось отправить комментарий'), color: 'red' });
    }
  };

  const confirmedBy = report.confirmed_by ? namesById.get(report.confirmed_by) : undefined;

  return (
    <Stack gap="xs">
      {report.status === 'confirmed' && (
        <Alert color="green" icon={<IconCircleCheck size={18} />} py="xs">
          Подтверждён{confirmedBy ? ` — ${confirmedBy}` : ''}
          {report.confirmed_at ? `, ${formatReportStamp(report.confirmed_at)}` : ''}. Зафиксирован в финансовых
          отчётах.
          {/* История для прозрачности: если до подтверждения отчёт
              возвращали водителю, это остаётся видно. */}
          {report.review_comment && (
            <Text size="xs" c="dimmed" mt={4}>
              До этого был не согласован: {report.review_comment}
              {reviewedLine ? ` (${reviewedLine})` : ''}
            </Text>
          )}
        </Alert>
      )}

      {report.status === 'rejected' && (
        <Alert color="red" icon={<IconMessageX size={18} />} title="Не согласован — ждём исправления от водителя" py="xs">
          <Text size="sm">{report.review_comment}</Text>
          {reviewedLine && (
            <Text size="xs" c="dimmed" mt={4}>
              {reviewedLine}
            </Text>
          )}
        </Alert>
      )}

      {report.status === 'submitted' && report.review_comment && (
        <Alert color="orange" variant="light" py="xs" title="Исправлен после несогласования">
          <Text size="sm">Комментарий был: {report.review_comment}</Text>
          {reviewedLine && (
            <Text size="xs" c="dimmed" mt={4}>
              {reviewedLine}
            </Text>
          )}
        </Alert>
      )}

      {report.status === 'submitted' && rejecting && (
        <Stack gap="xs">
          <Textarea
            label="Что нужно исправить"
            description="Водитель увидит комментарий у себя в ленте, исправит отчёт и отправит заново"
            placeholder="Например: не указан расход на парковку"
            autosize
            minRows={2}
            maxRows={6}
            required
            data-autofocus
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
          {canRejectReport(report) && (
            <Button variant="light" color="red" leftSection={<IconMessageX size={16} />} onClick={() => setRejecting(true)}>
              Не согласовать
            </Button>
          )}
          <Button leftSection={<IconCircleCheck size={16} />} onClick={doConfirm} loading={confirm.isPending}>
            Подтвердить отчёт и кассу
          </Button>
        </Group>
      )}
    </Stack>
  );
}
