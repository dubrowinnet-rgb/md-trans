'use client';

import { Anchor, Divider, Group, Image, Stack, Table, Text } from '@mantine/core';
import { formatMoney, formatTime } from '@/lib/dates';
import type { DriverReport } from '@/api/driverReports';

// Содержимое отчёта водителя — заказы дня, расходы, топливо, фото
// одометра и касса. Одно и то же в карточке ленты и в окне отчёта из
// таблицы, только для чтения: менять отчёт может лишь сам водитель.
// Разбито на две части, чтобы лента на широком экране ставила кассу
// колонкой справа, а окно отчёта — одну под другой (DriverReportBody).
// Превью фото одометра уменьшает сервер: снимок с камеры весит 1–2 МБ, а
// показываем 144×96, и лента крупной компании тянула бы десятки мегабайт.
// Уменьшает imgproxy из self-hosted Supabase (/storage/v1/render/image);
// где этого нет (облачный Supabase на бесплатном тарифе), Image сам
// покажет оригинал через fallbackSrc. Ширина и высота вдвое — для
// экранов с высокой плотностью.
const PUBLIC_OBJECT_PATH = '/storage/v1/object/public/';

function photoPreviewUrl(url: string): string {
  if (!url.includes(PUBLIC_OBJECT_PATH)) return url;
  const base = url.split('?')[0].replace(PUBLIC_OBJECT_PATH, '/storage/v1/render/image/public/');
  return `${base}?width=288&height=192&resize=cover&quality=70`;
}

export function DriverReportDetails({ report }: { report: DriverReport }) {
  return (
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
                const paymentLabel =
                  line.orders?.status === 'cancelled'
                    ? 'заказ отменён'
                    : price <= 0
                      ? 'безнал (заказ)'
                      : line.paid_by_transfer
                        ? 'перевод/QR'
                        : 'наличные';
                return (
                  <Table.Tr key={line.id}>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>{line.orders ? formatTime(line.orders.scheduled_start) : '—'}</Table.Td>
                    <Table.Td>{line.orders?.cargo_description || '—'}</Table.Td>
                    <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>
                      {formatMoney(price)}
                    </Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>
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
          {report.fuel_amount
            ? `${formatMoney(report.fuel_amount)} · ${report.fuel_payment_method === 'cash' ? 'наличные' : 'безнал'}`
            : 'Не указано'}
        </Text>
      </div>

      {report.odometer_photo_url && (
        <div>
          <Text size="sm" fw={500} mb={4}>
            Фото одометра
          </Text>
          {/* Размер задан заранее: в ленте иначе догрузка картинки сдвигает
              прокрутку, которая стоит на последнем отчёте. */}
          <Anchor href={report.odometer_photo_url} target="_blank" rel="noopener noreferrer" title="Открыть фото целиком">
            <Image
              src={photoPreviewUrl(report.odometer_photo_url)}
              fallbackSrc={report.odometer_photo_url}
              loading="lazy"
              alt="Фото одометра"
              w={144}
              h={96}
              fit="cover"
              radius="sm"
            />
          </Anchor>
        </div>
      )}
    </Stack>
  );
}

export function DriverReportCash({ report }: { report: DriverReport }) {
  return (
    <Table>
      <Table.Tbody>
        <Table.Tr>
          <Table.Td>Собрано наличными</Table.Td>
          <Table.Td ta="right">{formatMoney(report.cashCollected)}</Table.Td>
        </Table.Tr>
        <Table.Tr>
          <Table.Td>Расходы + топливо (нал.)</Table.Td>
          <Table.Td ta="right">
            {report.expensesTotal + report.fuelCash > 0 ? '−' : ''}
            {formatMoney(report.expensesTotal + report.fuelCash)}
          </Table.Td>
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
          <Table.Td fw={600}>Остаток у водителя</Table.Td>
          <Table.Td ta="right" fw={600} c="green">
            {report.discrepancy > 0 ? '+' : ''}
            {formatMoney(report.discrepancy)}
          </Table.Td>
        </Table.Tr>
      </Table.Tbody>
    </Table>
  );
}

export function DriverReportBody({ report }: { report: DriverReport }) {
  return (
    <Stack>
      <DriverReportDetails report={report} />
      <Divider label="Касса" labelPosition="left" />
      <DriverReportCash report={report} />
    </Stack>
  );
}
