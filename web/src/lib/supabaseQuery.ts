// Общие правила чтения из базы под нагрузкой (запрос Максима 2026-09-28:
// 1000 администраторов и 3000 сотрудников).

// PostgREST отдаёт не больше 1000 строк за один запрос — так настроено и в
// облачном Supabase, и на своём сервере (PGRST_DB_MAX_ROWS в официальном
// docker-compose). Остальное он молча отрезает, поэтому всё, что может
// оказаться длиннее, забираем страницами по 1000.
export const PAGE_SIZE = 1000;

type PageResult = PromiseLike<{ data: unknown[] | null; error: unknown }>;

// page(from, to) — запрос одной страницы с .range(from, to). У запроса
// должен быть однозначный порядок (последним ключом — id), иначе строки
// на границе страниц могут повториться или потеряться.
export async function fetchAllPages<T>(page: (from: number, to: number) => PageResult): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) return rows;
  }
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code ?? '') : '';
}

// Функции ещё нет в базе (миграция не запущена) — PostgREST отвечает PGRST202.
export function isMissingFunction(error: unknown): boolean {
  return errorCode(error) === 'PGRST202';
}

// Повторяем только сбой связи (кода нет) и недоступность базы (PGRST000–003).
// Ошибки прав и данных повтор не исправит, а при перегрузке сервера
// лишние повторы от тысяч открытых кабинетов только добавят нагрузки.
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  const code = errorCode(error);
  return code === '' || /^PGRST00[0-3]$/.test(code);
}

// Справочники (сотрудники, услуги, машины, шаблоны) меняются редко и после
// своих правок сбрасываются сами — перечитывать их чаще раза в 5 минут незачем.
export const REFERENCE_STALE_TIME = 5 * 60 * 1000;
