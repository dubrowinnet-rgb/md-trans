import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { List, TextInput } from 'react-native-paper';
import { suggestAddresses, yandexSuggestEnabled } from '../../lib/yandexSuggest';

// Поле адреса с подсказками (доработки 3, п.2): пока водитель/диспетчер
// печатает — совпадающие часто используемые адреса (recent_addresses,
// приходят из api/addresses.ts) и, если настроен ключ Yandex Geosuggest
// (EXPO_PUBLIC_YANDEX_SUGGEST_API_KEY), ещё и живые подсказки Яндекса.
// Без ключа просто не показываются — форма работает как обычный текст.
export function AddressField({
  label,
  icon,
  value,
  onChangeText,
  recentAddresses,
}: {
  label: string;
  icon: string;
  value: string;
  onChangeText: (value: string) => void;
  recentAddresses: string[];
}) {
  const [focused, setFocused] = useState(false);
  const [liveSuggestions, setLiveSuggestions] = useState<string[]>([]);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!yandexSuggestEnabled()) return undefined;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      suggestAddresses(value).then(setLiveSuggestions);
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [value]);

  useEffect(
    () => () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    },
    []
  );

  const suggestions = useMemo(() => {
    const query = value.trim().toLowerCase();
    const matchingRecent = query
      ? recentAddresses.filter((a) => a.toLowerCase().includes(query) && a !== value)
      : recentAddresses;
    const merged = [...matchingRecent, ...liveSuggestions.filter((a) => a !== value)];
    return [...new Set(merged)].slice(0, 6);
  }, [value, recentAddresses, liveSuggestions]);

  const pick = (address: string) => {
    onChangeText(address);
    setFocused(false);
  };

  return (
    <View>
      <TextInput
        mode="outlined"
        label={label}
        accessibilityLabel={label}
        left={<TextInput.Icon icon={icon} />}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setFocused(true);
        }}
        // Задержка перед скрытием — иначе onPress по подсказке не успевает
        // сработать: blur снимает список раньше, чем регистрируется тап.
        onBlur={() => {
          blurTimer.current = setTimeout(() => setFocused(false), 150);
        }}
      />
      {focused && suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((address) => (
            <List.Item
              key={address}
              title={address}
              titleNumberOfLines={2}
              left={(props) => <List.Icon {...props} icon="map-marker-outline" />}
              onPress={() => pick(address)}
              style={styles.suggestionRow}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  suggestions: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDDDDD',
    borderRadius: 4,
    marginTop: 2,
    backgroundColor: '#ffffff',
  },
  suggestionRow: {
    paddingVertical: 0,
  },
});
