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
import { GestureDetector, usePinchGesture } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { CalendarOrder } from '../../api/orders';
import { DEFAULT_WORKING_HOURS, type WorkingHours } from '../../api/companySettings';
import { PAGES_AROUND, type DaysMode } from '../../hooks/useCalendarNav';
import { useNow } from '../../hooks/useNow';
import { addDays, differenceInCalendarDays, minutesFromDayStart, PIXELS_PER_MINUTE } from '../../utils/date';
import { AXIS_WIDTH, DayBody, DayHeader, HEADER_HEIGHT, HourAxis } from './DayCells';

// После каждого перелистывания страницы пересобираются вокруг новой даты,
// поэтому листать можно бесконечно в обе стороны.
const PAGE_COUNT = PAGES_AROUND * 2 + 1;

// Границы масштаба сетки (Максим, 30.09, «Правки 3», п.3 + подтверждение
// «делаем сейчас» от того же дня): 0.55 — весь день помещается на экране
// современного телефона, 2.2 — крупно для точной правки коротких заказов.
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 2.2;

// Календарь с листанием по страницам (1, 3 или 7 дней). pagingEnabled
// останавливает прокрутку ровно на границе страницы, шапка с датами
// закреплена сверху и двигается вместе с сеткой.
export function PagedCalendar(props: {
  mode: DaysMode;
  anchor: Date;
  onAnchorChange: (date: Date) => void;
  orders: CalendarOrder[];
  onPressOrder: (order: CalendarOrder) => void;
  onPressSlot?: (date: Date) => void;
  scrollToNowSignal: number;
  workingHours?: WorkingHours;
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
  workingHours = DEFAULT_WORKING_HOURS,
  width,
}: Parameters<typeof PagedCalendar>[0] & { width: number }) {
  const now = useNow();
  const pageWidth = width - AXIS_WIDTH;
  const columnWidth = pageWidth / mode;
  const compact = mode === 7;
  const middle = PAGES_AROUND * pageWidth;

  // Сжатие сетки двумя пальцами (Максим, 30.09, «Правки 3», п.3): масштаб
  // одной на весь календарь, меняет плотность минут в пикселях — часовая
  // сетка, разметка заказов и подписи часов пересчитываются от него (см.
  // ниже и пропсы HourAxis/DayBody/OrderBlock), а не от фиксированных
  // PIXELS_PER_MINUTE/HOUR_HEIGHT/GRID_HEIGHT.
  const [zoomScale, setZoomScale] = useState(1);
  const pixelsPerMinute = PIXELS_PER_MINUTE * zoomScale;
  const hourHeight = 60 * pixelsPerMinute;
  const gridHeight = 24 * hourHeight;
  // Всегда свежее значение для обработчиков/эффектов, которые не должны
  // сами перезапускаться при каждом изменении масштаба (см. ниже).
  const pixelsPerMinuteRef = useRef(pixelsPerMinute);
  pixelsPerMinuteRef.current = pixelsPerMinute;

  const firstDay = useMemo(() => addDays(anchor, -PAGES_AROUND * mode), [anchor, mode]);
  const pages = useMemo(
    () =>
      Array.from({ length: PAGE_COUNT }, (_, page) =>
        Array.from({ length: mode }, (_, i) => page * mode + i)
      ),
    [mode]
  );

  const ordersByDay = useMemo(() => {
    const map = new Map<number, CalendarOrder[]>();
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

  // Общий масштаб, зафиксированный React-состоянием (см. выше), зеркалится
  // в shared value — читается из ворклетов жеста, которые идут на UI-потоке
  // до того, как setZoomScale успеет перерендерить компонент.
  const scrollY = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const committedScale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const liveScale = useSharedValue(1);
  const originY = useSharedValue(0);
  const didCommit = useSharedValue(false);

  useEffect(() => {
    committedScale.value = zoomScale;
  }, [zoomScale, committedScale]);

  // Точка, откуда «пришёл» текущий пинч — чтобы после коммита масштаба
  // прокрутка осталась на том же времени суток, а не прыгнула к началу дня
  // (см. эффект компенсации ниже).
  const pinchAnchorRef = useRef<{ scrollY: number; oldPixelsPerMinute: number } | null>(null);

  const commitZoom = useCallback((scale: number, atScrollY: number) => {
    pinchAnchorRef.current = { scrollY: atScrollY, oldPixelsPerMinute: pixelsPerMinuteRef.current };
    setZoomScale(scale);
  }, []);

  const pinchGesture = usePinchGesture({
    onBegin: () => {
      startScale.value = committedScale.value;
      liveScale.value = committedScale.value;
      didCommit.value = false;
      originY.value = scrollY.value + viewportHeight.value / 2;
    },
    onUpdate: (event) => {
      const next = startScale.value * event.scale;
      liveScale.value = Math.min(Math.max(next, MIN_ZOOM), MAX_ZOOM);
    },
    onDeactivate: () => {
      didCommit.value = true;
      runOnJS(commitZoom)(liveScale.value, scrollY.value);
    },
    onFinalize: () => {
      if (!didCommit.value) {
        liveScale.value = committedScale.value;
      }
    },
  });

  const animatedBodyStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: liveScale.value / committedScale.value }],
    transformOrigin: [0, originY.value, 0],
  }));

  // После того как масштаб зафиксирован (onDeactivate выше) и сетка
  // перерисовалась с новой плотностью пикселей, возвращаем прокрутку так,
  // чтобы время посередине экрана осталось тем же, что было до жеста.
  useEffect(() => {
    const anchor = pinchAnchorRef.current;
    pinchAnchorRef.current = null;
    if (!anchor) return;
    const viewport = viewportHeight.value;
    const centerMinute = (anchor.scrollY + viewport / 2) / anchor.oldPixelsPerMinute;
    const newY = Math.max(0, centerMinute * pixelsPerMinute - viewport / 2);
    verticalRef.current?.scrollTo({ y: newY, animated: false });
  }, [zoomScale, pixelsPerMinute, viewportHeight]);

  // После смены страницы (листание, стрелки, «Сегодня») возвращаем прокрутку
  // на среднюю страницу: содержимое уже пересобрано вокруг новой даты,
  // поэтому на экране ничего не прыгает.
  const recenter = useCallback(() => {
    bodyRef.current?.scrollTo({ x: middle, animated: false });
    headerRef.current?.scrollTo({ x: middle, animated: false });
  }, [middle]);
  useLayoutEffect(recenter, [anchor, recenter]);

  // На 1-дневном отображении экран всегда начинается с линии текущего
  // времени (выполненные заказы остаются выше, вне экрана — это ожидаемо),
  // как и раньше. На 3/7 днях — с начала рабочего дня (настройки компании),
  // а если на странице есть заказ раньше этого времени — с него (Максим,
  // 30.09, «Правки 3», п.1 и п.9): «линия сейчас» тут больше не участвует,
  // всегда одна и та же точка отсчёта вне зависимости от текущего времени.
  // anchor/mode в зависимостях — пересчитываем при каждом перелистывании
  // страницы (вперёд и назад), не только при первом входе: вертикальная
  // прокрутка одна на весь горизонтальный ScrollView (см. ниже), поэтому
  // должна переезжать на рабочее время новой страницы.
  // orders.length, а не orders — при первом заходе список ещё пуст (запрос
  // не успел ответить), эффект должен пересчитать цель, когда заказы
  // подгрузятся, но не гоняться за каждым новым объектом с тем же составом.
  useEffect(() => {
    let targetMinutes: number;
    if (mode === 1) {
      targetMinutes = minutesFromDayStart(new Date());
    } else {
      targetMinutes = workingHours.startMinutes;
      const pageEnd = addDays(anchor, mode);
      for (const order of orders) {
        const orderStart = new Date(order.scheduled_start);
        if (orderStart < anchor || orderStart >= pageEnd) continue;
        const orderMinutes = minutesFromDayStart(orderStart);
        if (orderMinutes < targetMinutes) targetMinutes = orderMinutes;
      }
    }
    const target = Math.max(0, targetMinutes * pixelsPerMinuteRef.current - 24);
    const id = setTimeout(() => verticalRef.current?.scrollTo({ y: target, animated: scrollToNowSignal > 0 }), 50);
    return () => clearTimeout(id);
  }, [scrollToNowSignal, orders.length, anchor, mode, workingHours.startMinutes]);

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
  // Текущая вертикальная прокрутка и высота окна — нужны жесту, чтобы
  // якорить масштаб на центре видимой области (см. pinchGesture выше).
  const onVerticalScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.value = e.nativeEvent.contentOffset.y;
  };
  const onVerticalLayout = (e: LayoutChangeEvent) => {
    viewportHeight.value = e.nativeEvent.layout.height;
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
        onScroll={onVerticalScroll}
        scrollEventThrottle={16}
        onLayout={onVerticalLayout}
      >
        <GestureDetector gesture={pinchGesture}>
          <Animated.View style={[styles.bodyRow, animatedBodyStyle]}>
            <HourAxis now={now} pixelsPerMinute={pixelsPerMinute} hourHeight={hourHeight} gridHeight={gridHeight} />
            <ScrollView
              ref={bodyRef}
              horizontal
              pagingEnabled
              // По умолчанию ('normal') перелистывание тормозит заметно
              // медленнее, чем у Bumpix (Максим, 30.09, «Правки 3», п.9,
              // сравнение с видео) — 'fast' ближе к тому, как там отпускаешь
              // палец и страница уже долистнула.
              decelerationRate="fast"
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
                      workingHours={workingHours}
                      pixelsPerMinute={pixelsPerMinute}
                      hourHeight={hourHeight}
                      gridHeight={gridHeight}
                      onPressOrder={onPressOrder}
                      onPressSlot={onPressSlot}
                    />
                  ))}
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        </GestureDetector>
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
