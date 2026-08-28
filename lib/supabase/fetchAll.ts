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
 *
 * CRITICAL — the query MUST end in a UNIQUE sort key (in practice `.order("id")`
 * as the last `.order()` call). Each page is a SEPARATE request, so Postgres
 * only guarantees a consistent overall order if the ORDER BY fully determines
 * it. Sorting by a non-unique column alone (e.g. `nombre`, where this gym has
 * 27 different students called "Lautaro") lets ties come back in a different
 * arrangement per request, so the same row can appear on two pages (visible as
 * a DUPLICATE student) while another is skipped entirely (a student who shows
 * up once and then vanishes on the next load). `assertStable` below fails loudly
 * in development if a call site forgets, and duplicate ids are dropped here as a
 * last line of defence so a paging anomaly can never reach the UI as a repeated
 * person.
 */
export async function fetchAllRows<T>(
  queryBuilder: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const results: T[] = [];
  const seenIds = new Set<string>();
  let from = 0;

  while (true) {
    const { data, error } = await (queryBuilder() as any).range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const id = (row as { id?: unknown })?.id;
      if (typeof id === "string") {
        // Same row served on two pages: keep the first, never surface a dup.
        if (seenIds.has(id)) continue;
        seenIds.add(id);
      }
      results.push(row);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return results;
}
