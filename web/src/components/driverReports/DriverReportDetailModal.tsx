'use client';

import { Alert, Anchor, Badge, Button, Divider, Group, Modal, Stack, Table, Text, Title } from '@mantine/core';
import { IconPhoto } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatMoney, formatTime } from '@/lib/dates';
import { DRIVER_REPORT_STATUS_COLORS, DRIVER_REPORT_STATUS_LABELS } from '@/lib/labels';
import { useConfirmDriverReport, type DriverReport } from '@/api/driverReports';

export function DriverReportDetailModal({
  report,
  employeeName,
  confirmedByName,
  currentEmployeeId,
  onClose,
}: {
  report: DriverReport;
  employeeName: string;
  confirmedByName: string | null;
  currentEmployeeId: string;
  onClose: () => void;
}) {
  const confirm = useConfirmDriverReport();

  const doConfirm = async () => {
    try {
      await confirm.mutateAsync({ id: report.id, confirmedBy: currentEmployeeId });
      notifications.show({ message: 'Отчёт и касса подтверждены', color: 'green' });
    } catch (err) {
      notifications.show({ message: errorMessage(err, 'Не удалось подтвердить отчёт'), color: 'red' });
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      size="lg"
      title={
        <Group gap="xs">
          <Title order={4}>
            {employeeName} · {formatDate(report.report_date)}
          </Title>
          <Badge color={DRIVER_REPORT_STATUS_COLORS[report.status]}>{DRIVER_REPORT_STATUS_LABELS[report.status]}</Badge>
        </Group>
      }
    >
      <Stack>
        <div>
          <Text size="sm" fw={500} mb={4}>
            Заказы за день
          </Text>
          {report.driver_report_orders.length === 0 ? (
            <Text size="sm" c="dimmed">
              Заказов нет
            </Text>
          ) : (
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Время</Table.Th>
                  <Table.Th>Груз</Table.Th>
                  <Table.Th ta="right">Сумма</Table.Th>
                  <Table.Th>Оплата</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {report.driver_report_orders.map((line) => {
                  const price = line.orders?.actual_price ?? 0;
                  const paymentLabel = price <= 0 ? 'безнал (заказ)' : line.paid_by_transfer ? 'перевод/QR' : 'наличные';
                  return (
                    <Table.Tr key={line.id}>
                      <Table.Td>{line.orders ? formatTime(line.orders.scheduled_start) : '—'}</Table.Td>
                      <Table.Td>{line.orders?.cargo_description || '—'}</Table.Td>
                      <Table.Td ta="right">{formatMoney(price)}</Table.Td>
                      <Table.Td>
                        <Text size="xs" c={paymentLabel === 'наличные' ? undefined : 'dimmed'}>
                          {paymentLabel}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          )}
        </div>

        <div>
          <Text size="sm" fw={500} mb={4}>
            Расходы
          </Text>
          {report.driver_report_expenses.length === 0 ? (
            <Text size="sm" c="dimmed">
              Расходов нет
            </Text>
          ) : (
            <Stack gap={4}>
              {report.driver_report_expenses.map((e) => (
                <Group key={e.id} justify="space-between">
                  <Text size="sm">{e.description}</Text>
                  <Text size="sm">{formatMoney(e.amount)}</Text>
                </Group>
              ))}
            </Stack>
          )}
        </div>

        <div>
          <Text size="sm" fw={500} mb={4}>
            Топливо
          </Text>
          <Text size="sm" c="dimmed">
            {report.fuel_amount ? `${formatMoney(report.fuel_amount)} · ${report.fuel_payment_method === 'cash' ? 'наличные' : 'безнал'}` : 'Не указано'}
          </Text>
        </div>

        {report.odometer_photo_url && (
          <Anchor href={report.odometer_photo_url} target="_blank" rel="noopener noreferrer" size="sm">
            <Group gap={6}>
              <IconPhoto size={16} />
              Фото одометра
            </Group>
          </Anchor>
        )}

        <Divider label="Касса" labelPosition="left" />
        <Table>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td>Собрано наличными</Table.Td>
              <Table.Td ta="right">{formatMoney(report.cashCollected)}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Расходы + топливо (нал.)</Table.Td>
              <Table.Td ta="right">−{formatMoney(report.expensesTotal + report.fuelCash)}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td fw={600}>Должен сдать</Table.Td>
              <Table.Td ta="right" fw={600}>
                {formatMoney(report.expectedHandIn)}
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Сдал по отчёту</Table.Td>
              <Table.Td ta="right">{formatMoney(report.cash_handed_in)}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td fw={600}>Расхождение</Table.Td>
              <Table.Td ta="right" fw={600} c={report.discrepancy === 0 ? 'green' : 'red'}>
                {report.discrepancy > 0 ? '+' : ''}
                {formatMoney(report.discrepancy)}
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>

        {report.status === 'confirmed' && (
          <Alert color="green">
            Подтверждено{confirmedByName ? ` — ${confirmedByName}` : ''}
            {report.confirmed_at ? `, ${formatDate(report.confirmed_at)}` : ''}. Зафиксировано в финансовых отчётах.
          </Alert>
        )}
        {report.status === 'draft' && <Alert color="gray">Водитель ещё заполняет отчёт — подтверждать пока нечего.</Alert>}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Закрыть
          </Button>
          {report.status === 'submitted' && (
            <Button onClick={doConfirm} loading={confirm.isPending}>
              Подтвердить отчёт и кассу
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
