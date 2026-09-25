'use client';

import { useState } from 'react';
import { Alert, Badge, Button, FileButton, Group, Modal, Stack, Table, Text, Title } from '@mantine/core';
import { IconFileSpreadsheet, IconUpload } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { errorMessage } from '@/lib/errors';
import { useImportClients, type ClientWithStats } from '@/api/clients';
import {
  CLIENT_FIELD_LABELS,
  decodeText,
  detectColumnsSmart,
  normalizePhone,
  parseCsv,
  parseDiscount,
  pluralClients,
  type ClientField,
} from '@/lib/csvImport';
import { parseXlsxFile } from '@/lib/xlsxImport';

interface Parsed {
  fileName: string;
  headerRow: string[];
  dataRows: string[][];
  columns: Partial<Record<ClientField, number>>;
  hasHeader: boolean;
  contentFields: ('name' | 'phone')[];
}

const PREVIEW_ROWS = 8;

// Импорт клиентской базы из CSV/TXT/XLSX: колонки определяются по
// заголовку файла, а если заголовка нет или он не узнан — по содержимому
// данных (см. detectColumnsSmart в lib/csvImport.ts: структура файла может
// быть какой угодно). Совпадение с уже существующим клиентом — по телефону
// (нормализованному, без кода страны). Найденных обновляем, остальных
// заводим как новых; строки без имени пропускаем.
export function ClientImportModal({
  clients,
  onClose,
}: {
  clients: ClientWithStats[];
  onClose: () => void;
}) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ inserted: number; updated: number; skipped: number } | null>(null);
  const importClients = useImportClients();

  const handleFile = async (file: File | null) => {
    setError(null);
    setResult(null);
    setParsed(null);
    if (!file) return;
    const ext = file.name.toLowerCase().split('.').pop() ?? '';
    if (ext === 'xls') {
      setError(
        'Старый формат .xls (Excel 97-2003) не читаем. Откройте файл в Excel или Google Таблицах и сохраните как .xlsx — «Файл → Сохранить как» — и загрузите его.'
      );
      return;
    }
    let rows: string[][];
    try {
      rows = ext === 'xlsx' ? await parseXlsxFile(file) : parseCsv(decodeText(await file.arrayBuffer()));
    } catch (err) {
      setError(errorMessage(err, 'Не удалось прочитать файл'));
      return;
    }
    if (rows.length === 0) {
      setError('Файл пустой или не удалось его прочитать.');
      return;
    }
    const detection = detectColumnsSmart(rows);
    if (detection.columns.name === undefined) {
      setError(
        'Не нашли в файле ни колонки «Имя»/«Клиент», ни столбца, похожего на имя по содержимому. Проверьте, что в файле есть имена или названия контактов.'
      );
      return;
    }
    setParsed({
      fileName: file.name,
      headerRow: detection.hasHeader ? rows[0] : [],
      dataRows: detection.hasHeader ? rows.slice(1) : rows,
      columns: detection.columns,
      hasHeader: detection.hasHeader,
      contentFields: detection.contentFields,
    });
  };

  const runImport = async () => {
    if (!parsed) return;
    setError(null);
    const { dataRows, columns } = parsed;
    const byPhone = new Map<string, ClientWithStats>();
    for (const c of clients) {
      const p = normalizePhone(c.phone);
      if (p) byPhone.set(p, c);
    }
    const get = (row: string[], field: ClientField) => {
      const idx = columns[field];
      return idx === undefined ? undefined : (row[idx] ?? '').trim();
    };

    const toInsert: { name: string; phone: string | null; discount_percent: number; notes: string | null }[] = [];
    const toUpdate: { id: string; name: string; phone?: string | null; discount_percent?: number; notes?: string | null }[] =
      [];
    let skipped = 0;
    const seenPhones = new Set<string>();

    for (const row of dataRows) {
      const name = get(row, 'name') ?? '';
      if (!name) {
        skipped++;
        continue;
      }
      const rawPhone = get(row, 'phone');
      const normPhone = normalizePhone(rawPhone);
      const discountRaw = get(row, 'discount');
      const notesRaw = get(row, 'notes');
      const existing = normPhone ? byPhone.get(normPhone) : undefined;
      if (existing) {
        toUpdate.push({
          id: existing.id,
          name,
          ...(rawPhone ? { phone: rawPhone } : {}),
          ...(discountRaw !== undefined ? { discount_percent: parseDiscount(discountRaw) } : {}),
          ...(notesRaw !== undefined ? { notes: notesRaw || null } : {}),
        });
      } else {
        // Внутри самого файла тоже могут повторяться телефоны (например,
        // несколько его строк-дублей) — второй и следующий раз заводим как
        // обновление того, что вставим первым, а не как ещё одного клиента.
        if (normPhone && seenPhones.has(normPhone)) {
          skipped++;
          continue;
        }
        if (normPhone) seenPhones.add(normPhone);
        toInsert.push({
          name,
          phone: rawPhone || null,
          discount_percent: discountRaw !== undefined ? parseDiscount(discountRaw) : 0,
          notes: notesRaw || null,
        });
      }
    }

    try {
      await importClients.mutateAsync({ toInsert, toUpdate });
      setResult({ inserted: toInsert.length, updated: toUpdate.length, skipped });
      notifications.show({ message: 'Импорт завершён', color: 'green' });
    } catch (err) {
      setError(errorMessage(err, 'Не удалось импортировать клиентов'));
    }
  };

  return (
    <Modal opened onClose={onClose} size="lg" title={<Title order={4}>Импорт клиентов из файла</Title>}>
      <Stack>
        {!result && (
          <>
            <Text size="sm" c="dimmed">
              Файл CSV, TXT или XLSX с колонками «Имя» (или «Клиент»), «Телефон», «Скидка», «Заметки» — названия
              колонок могут быть в любом порядке. Если заголовков нет или файл совсем другой структуры — попробуем
              найти имя и телефон по содержимому. Уже существующего клиента находим по телефону и обновляем,
              остальных заводим новыми.
            </Text>
            <FileButton
              onChange={handleFile}
              accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            >
              {(props) => (
                <Button {...props} variant="light" leftSection={<IconUpload size={16} />}>
                  Выбрать файл
                </Button>
              )}
            </FileButton>
          </>
        )}

        {error && <Alert color="red">{error}</Alert>}

        {parsed && !result && (
          <>
            <Group gap="xs">
              <IconFileSpreadsheet size={18} />
              <Text size="sm" fw={500}>
                {parsed.fileName}
              </Text>
              <Badge variant="light">{parsed.dataRows.length} строк</Badge>
            </Group>
            {!parsed.hasHeader && (
              <Text size="xs" c="dimmed">
                Заголовков колонок в файле не нашли — определили нужные колонки по содержимому данных.
              </Text>
            )}
            <Group gap="xs">
              {(Object.keys(CLIENT_FIELD_LABELS) as ClientField[]).map((f) => {
                const idx = parsed.columns[f];
                const byContent = (f === 'name' || f === 'phone') && parsed.contentFields.includes(f);
                let suffix = ': не найдена';
                if (idx !== undefined) suffix = byContent ? ' → по содержимому' : ` → «${parsed.headerRow[idx]}»`;
                return (
                  <Badge key={f} variant={idx !== undefined ? 'filled' : 'outline'} color={idx !== undefined ? 'violet' : 'gray'}>
                    {CLIENT_FIELD_LABELS[f]}
                    {suffix}
                  </Badge>
                );
              })}
            </Group>
            <Table striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  {(Object.keys(CLIENT_FIELD_LABELS) as ClientField[]).map((f) => (
                    <Table.Th key={f}>{CLIENT_FIELD_LABELS[f]}</Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {parsed.dataRows.slice(0, PREVIEW_ROWS).map((row, i) => (
                  <Table.Tr key={i}>
                    {(Object.keys(CLIENT_FIELD_LABELS) as ClientField[]).map((f) => {
                      const idx = parsed.columns[f];
                      return <Table.Td key={f}>{idx === undefined ? '—' : row[idx]}</Table.Td>;
                    })}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {parsed.dataRows.length > PREVIEW_ROWS && (
              <Text size="xs" c="dimmed">
                Показаны первые {PREVIEW_ROWS} из {parsed.dataRows.length}.
              </Text>
            )}
          </>
        )}

        {result && (
          <Alert color="green" title="Готово">
            Добавлено новых: {result.inserted}. Обновлено существующих (по совпадению телефона): {result.updated}.
            {result.skipped > 0 && ` Пропущено строк без имени: ${result.skipped}.`}
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {result ? 'Закрыть' : 'Отмена'}
          </Button>
          {parsed && !result && (
            <Button onClick={runImport} loading={importClients.isPending}>
              Импортировать {pluralClients(parsed.dataRows.length)}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
