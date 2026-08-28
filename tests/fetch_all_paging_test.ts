// Run with: npx tsx --test tests/fetch_all_paging_test.ts
//
// Regression cover for the paging bug that made students appear twice in the
// panel (and others vanish): each page is a separate request, so a non-unique
// ORDER BY lets Postgres arrange ties differently per page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchAllRows } from "../lib/supabase/fetchAll";

/** Fake builder whose pages overlap, exactly like an unstable sort would. */
function unstablePagedSource(pages: Array<Array<{ id: string }>>) {
  return () => {
    let range: { from: number; to: number } | null = null;
    const thenable = {
      range(from: number, to: number) {
        range = { from, to };
        return thenable;
      },
      then(resolve: (v: { data: { id: string }[] | null; error: null }) => void) {
        const pageIndex = range ? Math.floor(range.from / 1000) : 0;
        resolve({ data: pages[pageIndex] ?? [], error: null });
      },
    };
    return thenable as unknown as PromiseLike<{ data: { id: string }[] | null; error: null }>;
  };
}

function page(n: number, ids: string[]): Array<{ id: string }> {
  const filled = Array.from({ length: n }, (_, i) => ({ id: `filler-${i}` }));
  return [...ids.map((id) => ({ id })), ...filled].slice(0, Math.max(n, ids.length));
}

test("a row served on two pages is returned only once", async () => {
  // "Lautaro Accentini" (dupe-me) lands at the end of page 1 AND the start of
  // page 2 — the real-world symptom the client saw.
  const p1 = page(1000, ["dupe-me"]);
  const p2 = [{ id: "dupe-me" }, { id: "only-on-page-2" }];

  const rows = await fetchAllRows<{ id: string }>(unstablePagedSource([p1, p2]));
  const ids = rows.map((r) => r.id);

  assert.equal(ids.filter((id) => id === "dupe-me").length, 1, "duplicate must be collapsed");
  assert.ok(ids.includes("only-on-page-2"), "later-page rows must still be kept");
  assert.equal(new Set(ids).size, ids.length, "result must contain no duplicate ids");
});

test("stops at a short page and keeps every distinct row", async () => {
  const rows = await fetchAllRows<{ id: string }>(
    unstablePagedSource([[{ id: "a" }, { id: "b" }, { id: "c" }]]),
  );
  assert.deepEqual(rows.map((r) => r.id), ["a", "b", "c"]);
});

test("rows without a string id are passed through untouched", async () => {
  const rows = await fetchAllRows<any>(unstablePagedSource([[{ foo: 1 } as any, { foo: 2 } as any]]));
  assert.equal(rows.length, 2);
});
