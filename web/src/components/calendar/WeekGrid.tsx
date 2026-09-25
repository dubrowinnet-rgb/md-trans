'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text } from '@mantine/core';
import type { OrderWithDetails } from '@/api/orders';
import { dayjs, formatMoney, formatTime } from '@/lib/dates';
import { layoutDayOrders, orderColor } from './orderLayout';

export const HOUR_HEIGHT = 56;
const MIN_PX = HOUR_HEIGHT / 60;
const SNAP_MIN = 15;
const TIME_COL = 56;

function minutesOf(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function confirmedLabel(order: OrderWithDetails) {
  const ids = new Set(order.order_crew.map((c) => c.employee_id));
  if (ids.size === 0) return null;
  const confirmed = new Set(order.order_crew.filter((c) => c.status === 'confirmed').map((c) => c.employee_id));
  return `✓ ${confirmed.size}/${ids.size}`;
}

function crewNames(order: OrderWithDetails) {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const c of [...order.order_crew].sort((a, b) => Number(b.role === 'driver') - Number(a.role === 'driver'))) {
    if (seen.has(c.employee_id)) continue;
    seen.add(c.employee_id);
    names.push(c.employees?.name ?? '');
  }
  return names.filter(Boolean).join(', ');
}

// Сетка на 7 дней: колонки — дни недели, по вертикали — часы суток.
// Клик по пустому месту — новый заказ на это время; заказ можно
// перетащить мышкой на другой день/время (дальше спросим: перенести или
// скопировать).
export function WeekGrid({
  weekStart,
  orders,
  showAmount,
  canManage,
  onOpenOrder,
  onCreateAt,
  onDropOrder,
}: {
  weekStart: Date;
  orders: OrderWithDetails[];
  showAmount: boolean;
  canManage: boolean;
  onOpenOrder: (order: OrderWithDetails) => void;
  onCreateAt: (start: Date) => void;
  onDropOrder: (order: OrderWithDetails, newStart: Date) => void;
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => dayjs(weekStart).add(i, 'day').toDate()), [weekStart]);
  const [now, setNow] = useState(() => new Date());
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ order: OrderWithDetails; grabOffsetMin: number } | null>(null);
  const [dropHint, setDropHint] = useState<{ day: number; minute: number; duration: number } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // При открытии — прокрутка к 7 утра, чтобы сразу видеть рабочий день.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_HEIGHT - 8;
  }, []);

  const byDay = useMemo(
    () =>
      days.map((day) => {
        const dayOrders = orders.filter((o) => dayjs(o.scheduled_start).isSame(day, 'day'));
        return {
          placed: layoutDayOrders(dayOrders),
          count: dayOrders.filter((o) => o.status !== 'cancelled').length,
          sum: dayOrders
            .filter((o) => o.status !== 'cancelled')
            .reduce((s, o) => s + Number(o.actual_price ?? 0), 0),
        };
      }),
    [days, orders]
  );

  const minuteFromEvent = (e: React.MouseEvent<HTMLDivElement> | React.DragEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    return Math.max(0, Math.min(24 * 60 - SNAP_MIN, Math.floor(y / MIN_PX)));
  };

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Шапка дней */}
      <Box style={{ display: 'grid', gridTemplateColumns: `${TIME_COL}px repeat(7, 1fr)`, borderBottom: '1px solid var(--mantine-color-gray-3)', paddingRight: 12 }}>
        <div />
        {days.map((day, i) => {
          const isToday = dayjs(day).isSame(now, 'day');
          const weekend = day.getDay() === 0 || day.getDay() === 6;
          return (
            <Box key={i} py={6} px={8} style={{ borderLeft: '1px solid var(--mantine-color-gray-2)' }}>
              <Text size="xs" c={weekend ? 'red.7' : 'dimmed'} tt="uppercase" fw={600}>
                {dayjs(day).format('dd')}
              </Text>
              <Text
                fw={700}
                fz={20}
                c={isToday ? 'white' : undefined}
                bg={isToday ? 'violet.8' : undefined}
                w={34}
                ta="center"
                style={{ borderRadius: 17, lineHeight: '34px' }}
              >
                {day.getDate()}
              </Text>
              <Text size="xs" c="dimmed">
                {byDay[i].count ? `${byDay[i].count} зак.` : 'нет заказов'}
                {showAmount && byDay[i].sum ? ` · ${formatMoney(byDay[i].sum)}` : ''}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Сетка часов */}
      <Box ref={scrollRef} style={{ flex: 1, overflowY: 'scroll', minHeight: 0 }}>
        <Box style={{ display: 'grid', gridTemplateColumns: `${TIME_COL}px repeat(7, 1fr)`, position: 'relative', height: 24 * HOUR_HEIGHT }}>
          <Box style={{ position: 'relative' }}>
            {Array.from({ length: 24 }, (_, h) => (
              <Text key={h} size="xs" c="dimmed" style={{ position: 'absolute', top: h * HOUR_HEIGHT - 7, right: 8 }}>
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </Text>
            ))}
          </Box>
          {days.map((day, dayIndex) => {
            const isToday = dayjs(day).isSame(now, 'day');
            // Прошедшие дни и (для сегодня) время до текущего момента —
            // темнее и чёрно-белые, чтобы взгляд сразу шёл на предстоящее;
            // цветное на сетке — только то, что ещё будет.
            const isPastDay = dayjs(day).isBefore(now, 'day');
            return (
              <Box
                key={dayIndex}
                data-testid={`day-col-${dayIndex}`}
                style={{
                  position: 'relative',
                  borderLeft: '1px solid var(--mantine-color-gray-2)',
                  backgroundColor: isToday ? 'rgba(124, 58, 237, 0.03)' : isPastDay ? 'rgba(0, 0, 0, 0.05)' : undefined,
                  backgroundImage: `repeating-linear-gradient(to bottom, var(--mantine-color-gray-2) 0, var(--mantine-color-gray-2) 1px, transparent 1px, transparent ${HOUR_HEIGHT / 2}px)`,
                  cursor: canManage ? 'copy' : 'default',
                }}
                onClick={(e) => {
                  if (!canManage || e.target !== e.currentTarget) return;
                  const minute = Math.floor(minuteFromEvent(e) / 30) * 30;
                  onCreateAt(dayjs(day).startOf('day').add(minute, 'minute').toDate());
                }}
                onDragOver={(e) => {
                  if (!dragging.current) return;
                  e.preventDefault();
                  const { order, grabOffsetMin } = dragging.current;
                  const minute =
                    Math.round((minuteFromEvent(e) - grabOffsetMin) / SNAP_MIN) * SNAP_MIN;
                  const duration = dayjs(order.scheduled_end).diff(order.scheduled_start, 'minute');
                  setDropHint({ day: dayIndex, minute: Math.max(0, minute), duration });
                }}
                onDragLeave={() => setDropHint(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  const drag = dragging.current;
                  dragging.current = null;
                  setDropHint(null);
                  if (!drag) return;
                  const minute = Math.max(
                    0,
                    Math.round((minuteFromEvent(e) - drag.grabOffsetMin) / SNAP_MIN) * SNAP_MIN
                  );
                  onDropOrder(drag.order, dayjs(day).startOf('day').add(minute, 'minute').toDate());
                }}
              >
                {isToday && (
                  <Box
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: 0,
                      height: minutesOf(now) * MIN_PX,
                      background: 'rgba(0, 0, 0, 0.05)',
                      pointerEvents: 'none',
                      zIndex: 0,
                    }}
                  />
                )}
                {dropHint?.day === dayIndex && (
                  <Box
                    style={{
                      position: 'absolute',
                      left: 2,
                      right: 2,
                      top: dropHint.minute * MIN_PX,
                      height: Math.max(dropHint.duration * MIN_PX, 20),
                      border: '2px dashed var(--mantine-color-violet-6)',
                      borderRadius: 4,
                      pointerEvents: 'none',
                      zIndex: 3,
                    }}
                  >
                    <Text size="xs" fw={700} c="violet.8" px={4}>
                      {dayjs(day).startOf('day').add(dropHint.minute, 'minute').format('HH:mm')}
                    </Text>
                  </Box>
                )}
                {byDay[dayIndex].placed.map(({ order, lane, lanes }) => {
                  const start = new Date(order.scheduled_start);
                  const end = new Date(order.scheduled_end);
                  const top = minutesOf(start) * MIN_PX;
                  const endMin = dayjs(end).isSame(start, 'day') ? minutesOf(end) : 24 * 60;
                  const height = Math.max((endMin - minutesOf(start)) * MIN_PX, 22);
                  const cancelled = order.status === 'cancelled';
                  const pickup = order.order_stops.find((s) => s.is_primary && s.type === 'pickup')?.address;
                  const dropoff = order.order_stops.find((s) => s.is_primary && s.type === 'dropoff')?.address;
                  const service = order.order_services.map((s) => s.services?.name).filter(Boolean).join(', ');
                  const confirmed = confirmedLabel(order);
                  const crew = crewNames(order);
                  return (
                    <Box
                      key={order.id}
                      draggable={canManage}
                      onDragStart={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        dragging.current = {
                          order,
                          grabOffsetMin: Math.floor((e.clientY - rect.top) / MIN_PX),
                        };
                        e.dataTransfer.effectAllowed = 'copyMove';
                        e.dataTransfer.setData('text/plain', order.id);
                      }}
                      onDragEnd={() => {
                        dragging.current = null;
                        setDropHint(null);
                      }}
                      onClick={() => onOpenOrder(order)}
                      title={`${formatTime(start)}–${formatTime(end)} ${order.clients?.name ?? ''}`}
                      style={{
                        position: 'absolute',
                        top,
                        height,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                        background: orderColor(order, now),
                        borderRadius: 4,
                        padding: '2px 5px',
                        overflow: 'hidden',
                        cursor: canManage ? 'grab' : 'pointer',
                        color: 'white',
                        fontSize: 12,
                        lineHeight: '15px',
                        zIndex: 2,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                      }}
                    >
                      {cancelled && (
                        <div style={{ fontWeight: 700, color: '#f87171' }}>заказ отменен</div>
                      )}
                      <div style={{ textDecoration: cancelled ? 'line-through' : undefined }}>
                        <div>
                          <b>
                            {formatTime(start)}–{formatTime(end)}
                          </b>{' '}
                          {confirmed && <span style={{ opacity: 0.9 }}>{confirmed}</span>}
                        </div>
                        <div style={{ fontWeight: 700 }}>{order.clients?.name ?? 'Без клиента'}</div>
                        {service && <div>{service}</div>}
                        {(pickup || dropoff) && (
                          <div style={{ opacity: 0.9 }}>
                            {pickup ?? '—'} → {dropoff ?? '—'}
                          </div>
                        )}
                        {order.cargo_description && <div style={{ opacity: 0.85 }}>📦 {order.cargo_description}</div>}
                        {crew && <div style={{ opacity: 0.9 }}>👤 {crew}</div>}
                        {order.vehicles && <div style={{ opacity: 0.9 }}>🚚 {order.vehicles.plate}</div>}
                      </div>
                    </Box>
                  );
                })}
                {isToday && (
                  <Box
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: minutesOf(now) * MIN_PX,
                      height: 2,
                      background: '#ef4444',
                      zIndex: 4,
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
