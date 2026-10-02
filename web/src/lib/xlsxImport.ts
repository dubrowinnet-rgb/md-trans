// Чтение .xlsx для импорта клиентской базы. Библиотека подключается
// динамически (только когда реально выбран xlsx-файл), чтобы не раздувать
// основной бандл для тех, кто импортирует просто CSV/TXT.
//
// Старый бинарный .xls (Excel 97-2003) не читаем: пакет xlsx (SheetJS),
// который его понимает, годами не получает исправления опубликованных на
// npm уязвимостей (прототипное загрязнение, ReDoS — GHSA-4r6h-8v6p-xvw6,
// GHSA-5pgg-2g8v-p4x9, статус «No fix available»). read-excel-file читает
// только новый .xlsx, зато без известных уязвимостей — этого достаточно
// для реальных файлов 2026 года.
export async function parseXlsxFile(file: File): Promise<string[][]> {
  const { readSheet } = await import('read-excel-file/browser');
  const rows = await readSheet(file);
  return rows
    .map((row) =>
      row.map((cell) => {
        if (cell === null || cell === undefined) return '';
        if (cell instanceof Date) return cell.toLocaleDateString('ru-RU');
        return String(cell);
      })
    )
    .filter((r) => r.some((c) => c.trim() !== ''));
}
