// API отдаёт не больше 1000 строк за один запрос (PGRST_DB_MAX_ROWS — так и
// в облаке Supabase, и на своём сервере), а лишнее молча обрезает. Списки,
// которые у большой компании бывают длиннее (заказы в календаре за
// неделю), забираем страницами по 1000. Запрос обязан быть упорядочен
// однозначно (например, по времени и id) — иначе страницы перекроются.
export const API_MAX_ROWS = 1000;

export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += API_MAX_ROWS) {
    const { data, error } = await page(from, from + API_MAX_ROWS - 1);
    if (error) throw error;
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < API_MAX_ROWS) return rows;
  }
}
