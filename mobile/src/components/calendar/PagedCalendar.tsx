import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type { OrderWithDetails } from '../../api/orders';
import { PAGES_AROUND, type DaysMode } from '../../hooks/useCalendarNav';
import { useNow } from '../../hooks/useNow';
import { addDays, differenceInCalendarDays, minutesFromDayStart, PIXELS_PER_MINUTE } from '../../utils/date';
import { AXIS_WIDTH, DayBody, DayHeader, HEADER_HEIGHT, HourAxis } from './DayCells';

// После каждого перелистывания страницы пересобираются вокруг новой даты,
// поэтому листать можно бесконечно в обе стороны.
const PAGE_COUNT = PAGES_AROUND * 2 + 1;

// Календарь с листанием по страницам (1, 3 или 7 дней). pagingEnabled
// останавливает прокрутку ровно на границе страницы, шапка с датами
// закреплена сверху и двигается вместе с сеткой.
export function PagedCalendar(props: {
  mode: DaysMode;
  anchor: Date;
  onAnchorChange: (date: Date) => void;
  orders: OrderWithDetails[];
  onPressOrder: (order: OrderWithDetails) => void;
  onPressSlot?: (date: Date) => void;
  scrollToNowSignal: number;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View style={styles.container} onLayout={onLayout}>
      {width > 0 && <PagedCalendarInner key={`${props.mode}-${width}`} {...props} width={width} />}
    </View>
  );
}

function PagedCalendarInner({
  mode,
  anchor,
  onAnchorChange,
  orders,
  onPressOrder,
  onPressSlot,
  scrollToNowSignal,
  width,
}: Parameters<typeof PagedCalendar>[0] & { width: number }) {
  const now = useNow();
  const pageWidth = width - AXIS_WIDTH;
  const columnWidth = pageWidth / mode;
  const compact = mode === 7;
  const middle = PAGES_AROUND * pageWidth;

  const firstDay = useMemo(() => addDays(anchor, -PAGES_AROUND * mode), [anchor, mode]);
  const pages = useMemo(
    () =>
      Array.from({ length: PAGE_COUNT }, (_, page) =>
        Array.from({ length: mode }, (_, i) => page * mode + i)
      ),
    [mode]
  );

  const ordersByDay = useMemo(() => {
    const map = new Map<number, OrderWithDetails[]>();
    for (const order of orders) {
      const index = differenceInCalendarDays(new Date(order.scheduled_start), firstDay);
      const list = map.get(index);
      if (list) list.push(order);
      else map.set(index, [order]);
    }
    return map;
  }, [orders, firstDay]);

  const bodyRef = useRef<ScrollView>(null);
  const headerRef = useRef<ScrollView>(null);
  const verticalRef = useRef<ScrollView>(null);

  // После смены страницы (листание, стрелки, «Сегодня») возвращаем прокрутку
  // на среднюю страницу: содержимое уже пересобрано вокруг новой даты,
  // поэтому на экране ничего не прыгает.
  const recenter = useCallback(() => {
    bodyRef.current?.scrollTo({ x: middle, animated: false });
    headerRef.current?.scrollTo({ x: middle, animated: false });
  }, [middle]);
  useLayoutEffect(recenter, [anchor, recenter]);

  // При входе и по кнопке «Сегодня»: на 1 дне экран всегда начинается с
  // линии текущего времени (выполненные заказы просто остаются выше, вне
  // экрана — это ожидаемо). На 3/7 днях — с более ранней из двух точек:
  // либо линия времени, либо самый ранний ещё предстоящий заказ текущей
  // страницы, чтобы оба были видны без прокрутки.
  // orders.length в зависимостях — при первом заходе список заказов ещё
  // пуст (запрос не успел ответить), эффект должен пересчитать цель, когда
  // заказы подгрузятся, а не только при смене scrollToNowSignal.
  useEffect(() => {
    const now = new Date();
    let y = minutesFromDayStart(now) * PIXELS_PER_MINUTE;
    if (mode !== 1) {
      const pageEnd = addDays(anchor, mode);
      let earliest: number | null = null;
      for (const order of orders) {
        const orderStart = new Date(order.scheduled_start);
        if (orderStart <= now || orderStart < anchor || orderStart >= pageEnd) continue;
        const orderY = minutesFromDayStart(orderStart) * PIXELS_PER_MINUTE;
        if (earliest === null || orderY < earliest) earliest = orderY;
      }
      if (earliest !== null) y = Math.min(y, earliest);
    }
    const target = Math.max(0, y - 24);
    const id = setTimeout(() => verticalRef.current?.scrollTo({ y: target, animated: scrollToNowSignal > 0 }), 50);
    return () => clearTimeout(id);
  }, [scrollToNowSignal, orders.length]);

  const settle = useCallback(
    (offset: number) => {
      const page = Math.round(offset / pageWidth);
      const shift = page - PAGES_AROUND;
      if (shift !== 0) {
        onAnchorChange(addDays(anchor, shift * mode));
      } else if (Math.abs(offset - middle) > 1) {
        bodyRef.current?.scrollTo({ x: middle, animated: true });
      }
    },
    [pageWidth, middle, anchor, mode, onAnchorChange]
  );

  // В браузере нет momentum-событий: страницу фиксируем после паузы в прокрутке.
  const webSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (webSettleTimer.current) clearTimeout(webSettleTimer.current);
  }, []);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    headerRef.current?.scrollTo({ x, animated: false });
    if (Platform.OS === 'web') {
      if (webSettleTimer.current) clearTimeout(webSettleTimer.current);
      webSettleTimer.current = setTimeout(() => settle(x), 150);
    }
  };
  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => settle(e.nativeEvent.contentOffset.x);
  // Если палец отпустили ровно на границе страницы, инерции не будет —
  // фиксируем страницу сразу. Иначе ждём onMomentumScrollEnd.
  const onScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    if (Math.abs(x - Math.round(x / pageWidth) * pageWidth) < 1) settle(x);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={{ width: AXIS_WIDTH, height: HEADER_HEIGHT }} />
        <ScrollView
          ref={headerRef}
          horizontal
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: middle, y: 0 }}
          style={{ width: pageWidth }}
        >
          {pages.map((days, page) => (
            <View key={page} style={[styles.page, { width: pageWidth }]}>
              {days.map((i) => (
                <DayHeader
                  key={i}
                  date={addDays(firstDay, i)}
                  count={ordersByDay.get(i)?.length ?? 0}
                  width={columnWidth}
                  now={now}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
      <ScrollView
        ref={verticalRef}
        style={styles.container}
        bounces
        alwaysBounceVertical
        overScrollMode="always"
      >
        <View style={styles.bodyRow}>
          <HourAxis now={now} />
          <ScrollView
            ref={bodyRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: middle, y: 0 }}
            onLayout={recenter}
            style={{ width: pageWidth }}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onMomentumScrollEnd={onMomentumScrollEnd}
            onScrollEndDrag={onScrollEndDrag}
          >
            {pages.map((days, page) => (
              <View key={page} style={[styles.page, { width: pageWidth }]}>
                {days.map((i) => (
                  <DayBody
                    key={i}
                    date={addDays(firstDay, i)}
                    orders={ordersByDay.get(i) ?? []}
                    width={columnWidth}
                    now={now}
                    compact={compact}
                    onPressOrder={onPressOrder}
                    onPressSlot={onPressSlot}
                  />
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    height: HEADER_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DDDDDD',
  },
  bodyRow: {
    flexDirection: 'row',
  },
  page: {
    flexDirection: 'row',
  },
});
