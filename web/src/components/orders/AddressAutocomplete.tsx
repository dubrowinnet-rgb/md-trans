'use client';

import { useMemo, type CSSProperties } from 'react';
import { Autocomplete, type ComboboxItemGroup, type OptionsFilter } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useYandexAddressSuggest } from '@/api/addresses';

// Список уже отфильтрован ниже — встроенный фильтр Mantine отсеял бы
// подсказки Яндекса, в которых введённый текст не встречается дословно
// («тверская 7» → «Россия, Москва, Тверская улица, 7»).
const passThrough: OptionsFilter = ({ options }) => options;

// Поле адреса в форме заказа. Подсказки по порядку, как в мобильном
// приложении: адреса этого клиента, затем частые адреса компании, затем
// живые подсказки Яндекса (повторы своих адресов из них убираются).
export function AddressAutocomplete({
  label,
  value,
  onChange,
  clientAddresses,
  companyAddresses,
  style,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  clientAddresses: string[];
  companyAddresses: string[];
  style?: CSSProperties;
}) {
  const query = value.trim().toLowerCase();
  const matches = (a: string) => a !== value && (!query || a.toLowerCase().includes(query));
  const ownClient = clientAddresses.filter(matches);
  const ownCompany = companyAddresses.filter((a) => matches(a) && !clientAddresses.includes(a));

  const [debounced] = useDebouncedValue(value, 400);
  const yandex = useYandexAddressSuggest(debounced).data ?? [];

  const data = useMemo(() => {
    const seen = new Set<string>();
    const take = (items: string[]) =>
      items.filter((a) => {
        if (seen.has(a) || a === value) return false;
        seen.add(a);
        return true;
      });
    const groups: ComboboxItemGroup<string>[] = [
      { group: 'Адреса этого клиента', items: take(ownClient).slice(0, 5) },
      { group: 'Частые адреса', items: take(ownCompany).slice(0, 5) },
      { group: 'Яндекс', items: take(yandex) },
    ];
    return groups.filter((g) => g.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, clientAddresses, companyAddresses, yandex]);

  return (
    <Autocomplete
      style={style}
      label={label}
      data={data}
      value={value}
      onChange={onChange}
      filter={passThrough}
      comboboxProps={{ zIndex: 500 }}
    />
  );
}
