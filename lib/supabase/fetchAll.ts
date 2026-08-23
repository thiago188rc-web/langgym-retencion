/**
 * PostgREST (Supabase) caps a single request at 1000 rows by default. Any
 * "get everything for this org" query silently truncates once a table grows
 * past that — which is exactly what was happening to the dashboard metrics,
 * the alumnos list, cobros, etc. once `students` passed 1000 rows: only the
 * first page (alphabetical by whatever `.order()` was used) was ever loaded,
 * so every metric derived from it was wrong.
 *
 * `queryBuilder` must be a FACTORY (not a built query) because supabase-js
 * query builders are single-use — each page needs a fresh one with `.range()`
 * chained on top of the same filters/ordering.
 */
export async function fetchAllRows<T>(
  queryBuilder: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const results: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await (queryBuilder() as any).range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return results;
}
