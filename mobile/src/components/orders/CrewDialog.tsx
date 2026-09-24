import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Chip, Dialog, HelperText, Portal, Text } from 'react-native-paper';
import { useEmployees } from '../../api/employees';
import { useBusyEmployeeIds, useUpdateOrderCrew, type OrderWithDetails } from '../../api/orders';
import { useVehicles } from '../../api/vehicles';
import { toDateKey, useScheduleDaysOn, type ScheduleDay } from '../../api/schedule';
import { evaluateAvailability, sortByAvailability, TIER_COLOR } from '../../lib/crewAvailability';
import { serviceNeedsLoaders } from '../../lib/services';
import { FormSection } from '../form/FormSection';
import { DismissKeyboardView } from '../form/DismissKeyboardView';

function dotIcon(color: string) {
  return () => <View style={[styles.dot, { backgroundColor: color }]} />;
}

// Замена водителя/грузчиков и машины в уже созданном заказе — до этого
// экипаж был виден только на чтение. «Занят» здесь не учитывает сам этот
// заказ: без вычитания собственный водитель/грузчик всегда казался бы
// занятым своим же заказом.
export function CrewDialog({ order, onClose }: { order: OrderWithDetails; onClose: () => void }) {
  const updateCrew = useUpdateOrderCrew();
  const employees = useEmployees().data ?? [];
  const drivers = employees.filter((e) => e.role === 'driver');
  const loaders = employees.filter((e) => e.role === 'loader');
  const vehiclesQuery = useVehicles();

  const start = new Date(order.scheduled_start);
  const end = new Date(order.scheduled_end);
  const currentCrewIds = new Set(order.order_crew.map((c) => c.employee_id));
  const busyQuery = useBusyEmployeeIds(start, end);
  const busyIds = new Set([...(busyQuery.data ?? [])].filter((id) => !currentCrewIds.has(id)));
  const scheduleOnQuery = useScheduleDaysOn(toDateKey(start));
  const scheduleOn = scheduleOnQuery.data ?? new Map<string, ScheduleDay>();
  const availability = new Map(employees.map((e) => [e.id, evaluateAvailability(e, busyIds, scheduleOn, start, end)]));

  const needsLoaders = order.order_services.some((s) => s.services && serviceNeedsLoaders(s.services.name));

  const [driverId, setDriverId] = useState<string | null>(
    order.order_crew.find((c) => c.role === 'driver')?.employee_id ?? null
  );
  const [loaderIds, setLoaderIds] = useState<string[]>(
    order.order_crew.filter((c) => c.role === 'loader').map((c) => c.employee_id)
  );
  const [vehicleId, setVehicleId] = useState<string | null>(order.vehicle_id);
  const autoVehicleId = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedDriver = drivers.find((d) => d.id === driverId) ?? null;
  const loaderCandidates = selectedDriver ? [selectedDriver, ...loaders] : loaders;

  const selectDriver = (id: string | null) => {
    if (needsLoaders) {
      setLoaderIds((prev) => {
        let next = prev;
        if (driverId && next.includes(driverId)) next = next.filter((x) => x !== driverId);
        if (id && !next.includes(id)) next = [...next, id];
        return next;
      });
    }
    const fallbackVehicle = drivers.find((d) => d.id === id)?.default_vehicle_id ?? null;
    if (vehicleId === null || vehicleId === autoVehicleId.current) {
      autoVehicleId.current = fallbackVehicle;
      setVehicleId(fallbackVehicle);
    }
    setDriverId(id);
  };

  const toggleLoader = (id: string) =>
    setLoaderIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleSave = async () => {
    setError(null);
    try {
      await updateCrew.mutateAsync({
        orderId: order.id,
        vehicleId,
        crew: [
          ...(driverId ? [{ employee_id: driverId, role: 'driver' as const }] : []),
          ...(needsLoaders ? loaderIds.map((id) => ({ employee_id: id, role: 'loader' as const })) : []),
        ],
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить экипаж');
    }
  };

  return (
    <Portal>
      <Dialog visible onDismiss={onClose} style={styles.dialog}>
        <Dialog.Title>Экипаж и машина</Dialog.Title>
        <Dialog.ScrollArea style={styles.area}>
          <DismissKeyboardView>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
              <FormSection title="Водитель">
                {(busyQuery.isLoading || scheduleOnQuery.isLoading) && <ActivityIndicator size="small" />}
                {drivers.length === 0 && <Text variant="bodySmall">Нет ни одного водителя</Text>}
                <View style={styles.chips}>
                  {sortByAvailability(drivers, availability).map((driver) => {
                    const { tier, suffix } = availability.get(driver.id) ?? { tier: 'available' as const, suffix: '' };
                    return (
                      <Chip
                        key={driver.id}
                        icon={dotIcon(TIER_COLOR[tier])}
                        selected={driverId === driver.id}
                        showSelectedOverlay
                        onPress={() => selectDriver(driverId === driver.id ? null : driver.id)}
                      >
                        {`${driver.name}${suffix}`}
                      </Chip>
                    );
                  })}
                </View>
                {driverId && (
                  <>
                    <Text variant="labelMedium" style={styles.subLabel}>
                      Машина
                    </Text>
                    <View style={styles.chips}>
                      {(vehiclesQuery.data ?? []).map((vehicle) => (
                        <Chip
                          key={vehicle.id}
                          selected={vehicleId === vehicle.id}
                          showSelectedOverlay
                          onPress={() => setVehicleId(vehicleId === vehicle.id ? null : vehicle.id)}
                        >
                          {`${vehicle.name} · ${vehicle.plate}`}
                        </Chip>
                      ))}
                    </View>
                  </>
                )}
              </FormSection>

              {needsLoaders && (
                <FormSection title="Грузчики">
                  {loaderCandidates.length === 0 && <Text variant="bodySmall">Нет ни одного грузчика</Text>}
                  <View style={styles.chips}>
                    {sortByAvailability(loaderCandidates, availability).map((person) => {
                      const { tier, suffix } = availability.get(person.id) ?? { tier: 'available' as const, suffix: '' };
                      const isDriver = person.id === driverId;
                      return (
                        <Chip
                          key={person.id}
                          icon={dotIcon(TIER_COLOR[tier])}
                          selected={loaderIds.includes(person.id)}
                          showSelectedOverlay
                          disabled={tier === 'busy'}
                          onPress={() => toggleLoader(person.id)}
                        >
                          {`${person.name}${isDriver ? ' (водитель)' : ''}${suffix}`}
                        </Chip>
                      );
                    })}
                  </View>
                </FormSection>
              )}
              {error && <HelperText type="error">{error}</HelperText>}
            </ScrollView>
          </DismissKeyboardView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onClose}>Отмена</Button>
          <Button mode="contained" onPress={handleSave} loading={updateCrew.isPending} disabled={updateCrew.isPending}>
            Сохранить
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    maxHeight: '90%',
  },
  area: {
    paddingHorizontal: 0,
  },
  scroll: {
    flexGrow: 1,
    flexShrink: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  subLabel: {
    marginTop: 8,
    marginBottom: 2,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
