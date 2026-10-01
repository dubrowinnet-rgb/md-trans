'use client';

import { useMemo, useState } from 'react';
import { ActionIcon, Alert, Box, Button, Drawer, Group, Loader, NavLink, Paper, ScrollArea, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconTruck, IconUser, IconUsers } from '@tabler/icons-react';
import { useCopyOrder, useMoveOrder, useOrdersForRange, type OrderWithDetails } from '@/api/orders';
import { useEmployees } from '@/api/employees';
import { useSession } from '@/providers/SessionProvider';
import { canManageOrders, canViewOrderAmount } from '@/lib/permissions';
import { dayjs, startOfWeek } from '@/lib/dates';
import { WeekHeader } from '@/components/calendar/WeekHeader';
import { WeekGrid } from '@/components/calendar/WeekGrid';
import { useOrderUI } from '@/components/orders/OrderUIProvider';

const ALL = 'all';

export default function CalendarPage() {
  const [anchor, setAnchor] = useState(() => new Date());
  const [employeeFilter, setEmployeeFilter] = useState<string>(ALL);
  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const weekEnd = useMemo(() => dayjs(weekStart).add(7, 'day').toDate(), [weekStart]);
  const { employee } = useSession();
  const canManage = canManageOrders(employee);
  const ordersQuery = useOrdersForRange(weekStart, weekEnd);
  const employees = useEmployees().data ?? [];
  const ui = useOrderUI();
  const moveOrder = useMoveOrder();
  const copyOrder = useCopyOrder();
  const [filterOpened, { open: openFilter, close: closeFilter }] = useDisclosure();

  const orders = useMemo(() => {
    const all = ordersQuery.data ?? [];
    if (employeeFilter === ALL) return all;
    return all.filter((o) => o.order_crew.some((c) => c.employee_id === employeeFilter));
  }, [ordersQuery.data, employeeFilter]);

  const preset = employeeFilter === ALL ? undefined : employeeFilter;

  // Перетащили заказ — спрашиваем, перенести его или сделать копию.
  const handleDrop = (order: OrderWithDetails, newStart: Date) => {
    const duration = dayjs(order.scheduled_end).diff(order.scheduled_start, 'minute');
    const newEnd = dayjs(newStart).add(duration, 'minute').toDate();
    if (newStart.getTime() === new Date(order.scheduled_start).getTime()) return;
    const when = `${dayjs(newStart).format('dd, D MMMM, HH:mm')}–${dayjs(newEnd).format('HH:mm')}`;
    const run = async (kind: 'move' | 'copy') => {
      modals.closeAll();
      try {
        if (kind === 'move') {
          await moveOrder.mutateAsync({ order, start: newStart, end: newEnd });
          notifications.show({ message: `Заказ перенесён на ${when}`, color: 'green' });
        } else {
          await copyOrder.mutateAsync({ order, start: newStart, end: newEnd, withCrew: true });
          notifications.show({ message: `Копия создана на ${when}`, color: 'green' });
        }
      } catch (err) {
        notifications.show({ title: 'Не получилось', message: (err as Error).message, color: 'red' });
      }
    };
    modals.open({
      title: order.clients?.name ?? 'Заказ',
      children: (
        <Stack>
          <Text size="sm">Новое время: {when}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => modals.closeAll()}>
              Отмена
            </Button>
            <Button variant="light" onClick={() => run('copy')}>
              Скопировать сюда
            </Button>
            <Button onClick={() => run('move')}>Перенести</Button>
          </Group>
        </Stack>
      ),
    });
  };

  // Общее содержимое левой панели — на десктопе постоянная колонка
  // (Paper), на телефоне, где 230px постоянно отъедать нечем, та же
  // разметка едет в выезжающий Drawer поверх остального экрана.
  const sidebarContent = (
    <>
      {canManage && (
        <Button
          fullWidth
          leftSection={<IconPlus size={16} />}
          mb="md"
          onClick={() => {
            closeFilter();
            ui.openNewOrder({ employeeId: preset });
          }}
        >
          Новый заказ
        </Button>
      )}
      <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={4}>
        Сотрудники
      </Text>
      <ScrollArea style={{ flex: 1 }}>
        <NavLink
          label="Все заказы"
          leftSection={<IconUsers size={16} />}
          active={employeeFilter === ALL}
          onClick={() => {
            setEmployeeFilter(ALL);
            closeFilter();
          }}
          style={{ borderRadius: 6 }}
        />
        {employees.map((e) => (
          <NavLink
            key={e.id}
            label={e.name}
            description={e.role === 'driver' ? 'Водитель' : 'Грузчик'}
            leftSection={e.role === 'driver' ? <IconTruck size={16} /> : <IconUser size={16} />}
            active={employeeFilter === e.id}
            onClick={() => {
              setEmployeeFilter(e.id);
              closeFilter();
            }}
            style={{ borderRadius: 6 }}
          />
        ))}
        {employees.length === 0 && (
          <Text size="sm" c="dimmed" mt="xs">
            Нет ни одного водителя или грузчика
          </Text>
        )}
      </ScrollArea>
      {canManage && (
        <Text size="xs" c="dimmed" mt="sm">
          Клик по пустому месту — новый заказ. Заказ можно перетащить мышкой на другой день или время.
        </Text>
      )}
    </>
  );

  return (
    // 100% (не 100vh) — чтобы точно попадать в высоту AppShell.Main:
    // на телефоне у неё сверху отступ под шапку с бургером, 100vh здесь
    // вылезал бы за экран ровно на высоту этой шапки.
    <Box style={{ display: 'flex', height: '100%' }}>
      <Paper
        w={230}
        radius={0}
        p="sm"
        visibleFrom="sm"
        style={{ borderRight: '1px solid var(--mantine-color-gray-3)', display: 'flex', flexDirection: 'column' }}
      >
        {sidebarContent}
      </Paper>
      <Drawer opened={filterOpened} onClose={closeFilter} title="Сотрудники" size="xs">
        <Box style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>{sidebarContent}</Box>
      </Drawer>

      <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Group justify="space-between" px="md" py="sm" wrap="wrap" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
          <Group gap="xs" wrap="nowrap">
            <ActionIcon hiddenFrom="sm" variant="default" size="lg" onClick={openFilter} aria-label="Сотрудники">
              <IconUsers size={18} />
            </ActionIcon>
            <WeekHeader anchor={anchor} onChange={setAnchor} />
            {canManage && (
              <ActionIcon hiddenFrom="sm" size="lg" onClick={() => ui.openNewOrder({ employeeId: preset })} aria-label="Новый заказ">
                <IconPlus size={18} />
              </ActionIcon>
            )}
          </Group>
          <Group gap="xs">
            {ordersQuery.isFetching && <Loader size="xs" />}
            <Text size="sm" c="dimmed" visibleFrom="sm">
              {dayjs(weekStart).format('D MMM')} – {dayjs(weekEnd).subtract(1, 'day').format('D MMM YYYY')}
            </Text>
          </Group>
        </Group>
        {ordersQuery.isError && (
          <Alert color="red" m="sm">
            Ошибка загрузки заказов: {ordersQuery.error.message}
          </Alert>
        )}
        <Box style={{ flex: 1, minHeight: 0, background: 'white' }}>
          <WeekGrid
            weekStart={weekStart}
            orders={orders}
            showAmount={canViewOrderAmount(employee)}
            canManage={canManage}
            onOpenOrder={(o) => ui.openOrder(o.id)}
            onCreateAt={(start) => ui.openNewOrder({ start, employeeId: preset })}
            onDropOrder={handleDrop}
          />
        </Box>
      </Box>
    </Box>
  );
}
