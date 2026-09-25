'use client';

import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconCopy,
  IconArrowsMove,
  IconMapPin,
  IconPackageExport,
  IconPackageImport,
  IconPencil,
  IconPhone,
  IconRoute,
  IconTrash,
  IconTruck,
  IconUser,
} from '@tabler/icons-react';
import { useDeleteOrder, useOrder, useUpdateOrderStatus, type OrderWithDetails } from '@/api/orders';
import { useSession } from '@/providers/SessionProvider';
import { canManageOrders, canViewClientPhone, canViewOrderAmount } from '@/lib/permissions';
import { CREW_STATUS_LABELS, ORDER_STATUSES, ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '@/lib/labels';
import { dayjs, formatMoney, formatTime } from '@/lib/dates';
import { formatPhone } from '@/lib/phone';
import { yandexMapsRouteUrl } from '@/lib/yandexMaps';
import type { CrewStatus } from '@/types/database';
import { useOrderUI } from './OrderUIProvider';

interface MergedCrew {
  employeeId: string;
  name: string;
  isDriver: boolean;
  isLoader: boolean;
  status: CrewStatus;
}

// Водитель, совмещающий функции грузчика, даёт две строки order_crew —
// показываем его одной строкой, как в мобильном приложении.
export function mergeCrew(order: OrderWithDetails): MergedCrew[] {
  const merged: MergedCrew[] = [];
  for (const c of order.order_crew) {
    const existing = merged.find((m) => m.employeeId === c.employee_id);
    if (existing) {
      if (c.role === 'driver') existing.isDriver = true;
      else existing.isLoader = true;
      existing.status = c.status;
    } else {
      merged.push({
        employeeId: c.employee_id,
        name: c.employees?.name ?? 'Сотрудник',
        isDriver: c.role === 'driver',
        isLoader: c.role === 'loader',
        status: c.status,
      });
    }
  }
  return merged.sort((a, b) => Number(b.isDriver) - Number(a.isDriver));
}

function crewRoleLabel(crew: MergedCrew) {
  if (crew.isDriver && crew.isLoader) return 'Водитель и грузчик';
  return crew.isDriver ? 'Водитель' : 'Грузчик';
}

// Карточка заказа справа от календаря: всё о заказе и действия над ним.
export function OrderDrawer({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { employee } = useSession();
  const canManage = canManageOrders(employee);
  const orderQuery = useOrder(orderId);
  const order = orderQuery.data;
  const updateStatus = useUpdateOrderStatus();
  const deleteOrder = useDeleteOrder();
  const ui = useOrderUI();

  const confirmDelete = (o: OrderWithDetails) =>
    modals.openConfirmModal({
      title: 'Удалить заказ?',
      zIndex: 400,
      children: (
        <Text size="sm">
          Заказ {o.clients?.name ?? ''} на {dayjs(o.scheduled_start).format('D MMMM, HH:mm')} будет удалён без
          возможности восстановления. Если заказ просто не состоялся, лучше поставьте статус «Отменён».
        </Text>
      ),
      labels: { confirm: 'Удалить', cancel: 'Отмена' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await deleteOrder.mutateAsync(o.id);
          notifications.show({ message: 'Заказ удалён', color: 'green' });
          onClose();
        } catch (err) {
          notifications.show({ message: (err as Error).message, color: 'red' });
        }
      },
    });

  return (
    <Drawer
      opened={Boolean(orderId)}
      onClose={onClose}
      position="right"
      size={480}
      zIndex={300}
      title={<Title order={4}>Заказ</Title>}
    >
      {orderQuery.isLoading && <Loader />}
      {orderQuery.isError && <Alert color="red">{orderQuery.error.message}</Alert>}
      {order && (
        <OrderDetails
          order={order}
          canManage={canManage}
          showAmount={canViewOrderAmount(employee)}
          clientPhone={canViewClientPhone(employee, order) ? order.clients?.phone ?? null : null}
          statusPending={updateStatus.isPending}
          onStatus={(status) =>
            updateStatus.mutate(
              { orderId: order.id, status },
              { onError: (err) => notifications.show({ message: err.message, color: 'red' }) }
            )
          }
          onEdit={() => ui.openEditOrder(order)}
          onCopy={() => ui.openCopyMove(order, 'copy')}
          onMove={() => ui.openCopyMove(order, 'move')}
          onDelete={() => confirmDelete(order)}
          onOpenClient={() => order.client_id && ui.openClient(order.client_id)}
        />
      )}
    </Drawer>
  );
}

function OrderDetails({
  order,
  canManage,
  showAmount,
  clientPhone,
  statusPending,
  onStatus,
  onEdit,
  onCopy,
  onMove,
  onDelete,
  onOpenClient,
}: {
  order: OrderWithDetails;
  canManage: boolean;
  showAmount: boolean;
  clientPhone: string | null;
  statusPending: boolean;
  onStatus: (s: OrderWithDetails['status']) => void;
  onEdit: () => void;
  onCopy: () => void;
  onMove: () => void;
  onDelete: () => void;
  onOpenClient: () => void;
}) {
  const start = new Date(order.scheduled_start);
  const end = new Date(order.scheduled_end);
  const stops = [...order.order_stops].sort((a, b) => a.order_index - b.order_index);
  const crew = mergeCrew(order);

  return (
    <Stack gap="md">
      <div>
        <Anchor component="button" onClick={onOpenClient} fw={700} fz="xl" c="dark">
          {order.clients?.name ?? 'Без клиента'}
        </Anchor>
        <Text c="dimmed">
          {dayjs(start).format('dddd, D MMMM YYYY')}, {formatTime(start)}–{formatTime(end)}
        </Text>
      </div>

      <Group gap={6}>
        {ORDER_STATUSES.map((status) => {
          const active = order.status === status;
          return (
            <Badge
              key={status}
              size="lg"
              variant={active ? 'filled' : 'outline'}
              color={active ? undefined : 'gray'}
              style={{
                cursor: canManage && !statusPending ? 'pointer' : 'default',
                background: active ? ORDER_STATUS_COLORS[status].bg : undefined,
                color: active ? '#111' : undefined,
                borderColor: ORDER_STATUS_COLORS[status].border,
                textTransform: 'none',
              }}
              onClick={() => canManage && !statusPending && !active && onStatus(status)}
            >
              {ORDER_STATUS_LABELS[status]}
            </Badge>
          );
        })}
      </Group>

      {canManage && (
        <Group gap="xs">
          <Button size="xs" leftSection={<IconPencil size={16} />} onClick={onEdit}>
            Изменить
          </Button>
          <Button size="xs" variant="light" leftSection={<IconCopy size={16} />} onClick={onCopy}>
            Копировать
          </Button>
          <Button size="xs" variant="light" leftSection={<IconArrowsMove size={16} />} onClick={onMove}>
            Перенести
          </Button>
          <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={onDelete}>
            Удалить
          </Button>
        </Group>
      )}

      {(clientPhone || order.clients?.discount_percent) && (
        <Group gap="lg">
          {clientPhone && (
            <Group gap={6}>
              <IconPhone size={16} />
              <Anchor href={`tel:${clientPhone}`}>{formatPhone(clientPhone)}</Anchor>
            </Group>
          )}
          {order.clients?.discount_percent ? (
            <Text size="sm">Скидка клиента: {order.clients.discount_percent}%</Text>
          ) : null}
        </Group>
      )}

      <Divider label="Маршрут" labelPosition="left" />
      <Stack gap={6}>
        {stops.map((stop) => (
          <Group key={stop.id} gap="xs" wrap="nowrap" align="flex-start">
            <ThemeIcon variant="light" size="sm" color={stop.type === 'pickup' ? 'blue' : 'teal'}>
              {stop.is_primary ? (
                stop.type === 'pickup' ? (
                  <IconPackageExport size={14} />
                ) : (
                  <IconPackageImport size={14} />
                )
              ) : (
                <IconMapPin size={14} />
              )}
            </ThemeIcon>
            <div>
              <Text size="sm">{stop.address}</Text>
              <Text size="xs" c="dimmed">
                {stop.type === 'pickup' ? 'Загрузка' : 'Выгрузка'}
                {stop.is_primary ? '' : ' (доп. точка)'}
              </Text>
            </div>
          </Group>
        ))}
        {stops.length > 0 && (
          <Anchor href={yandexMapsRouteUrl(stops.map((s) => s.address))} target="_blank" size="sm">
            <Group gap={4}>
              <IconRoute size={16} /> Маршрут в Яндекс.Картах
            </Group>
          </Anchor>
        )}
      </Stack>

      <Divider label="Бригада" labelPosition="left" />
      <Stack gap={6}>
        {crew.length === 0 && <Text size="sm">Никто не назначен</Text>}
        {crew.map((c) => (
          <Group key={c.employeeId} justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              <ThemeIcon variant="light" size="sm" color="gray">
                {c.isDriver ? <IconTruck size={14} /> : <IconUser size={14} />}
              </ThemeIcon>
              <div>
                <Text size="sm" fw={500}>
                  {c.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {crewRoleLabel(c)} · {CREW_STATUS_LABELS[c.status]}
                  {c.isDriver && order.vehicles ? ` · ${order.vehicles.plate}` : ''}
                </Text>
              </div>
            </Group>
            {c.status === 'confirmed' && (
              <ThemeIcon color="green" radius="xl" size="sm">
                <IconCheck size={14} />
              </ThemeIcon>
            )}
          </Group>
        ))}
      </Stack>

      <Divider label="Детали" labelPosition="left" />
      <SimpleGrid cols={2} spacing="sm">
        <Box>
          <Text size="xs" c="dimmed">
            Услуги
          </Text>
          {order.order_services.length === 0 && <Text size="sm">—</Text>}
          {order.order_services.map((s, i) => (
            <Group key={s.services?.id ?? i} gap={6}>
              <Box w={4} h={14} style={{ background: s.services?.color ?? '#8E24AA', borderRadius: 2 }} />
              <Text size="sm">{s.services?.name ?? 'Услуга'}</Text>
            </Group>
          ))}
        </Box>
        {showAmount && (
          <Box>
            <Text size="xs" c="dimmed">
              Сумма
            </Text>
            <Text size="sm" fw={600}>
              {formatMoney(order.actual_price)}
            </Text>
          </Box>
        )}
        <Box>
          <Text size="xs" c="dimmed">
            Груз
          </Text>
          <Text size="sm">{order.cargo_description || '—'}</Text>
        </Box>
        <Box>
          <Text size="xs" c="dimmed">
            Машина
          </Text>
          <Text size="sm">{order.vehicles ? `${order.vehicles.name} · ${order.vehicles.plate}` : '—'}</Text>
        </Box>
      </SimpleGrid>
      {order.comment && (
        <Box>
          <Text size="xs" c="dimmed">
            Комментарий
          </Text>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {order.comment}
          </Text>
        </Box>
      )}
    </Stack>
  );
}
