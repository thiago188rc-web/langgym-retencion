// Run with: npx tsx --test tests/attendance_dates_test.ts
//
// The attendance sheet is addressed BY DATE, so an off-by-one day here means
// the professor marks the wrong class. Argentina is UTC-3, so any use of
// toISOString() would roll the date over after 21:00 local.
import { test } from "node:test";
import assert from "node:assert/strict";
import { toLocalISO, parseLocalISO, humanDayLabel } from "../lib/dates";

test("parseLocalISO builds a LOCAL midnight date, not UTC", () => {
  const d = parseLocalISO("2026-09-04");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 8); // septiembre
  assert.equal(d.getDate(), 4);
  assert.equal(d.getHours(), 0);
});

test("parseLocalISO round-trips through toLocalISO", () => {
  for (const iso of ["2026-01-01", "2026-09-04", "2026-12-31", "2026-02-28"]) {
    assert.equal(toLocalISO(parseLocalISO(iso)), iso);
  }
});

test("the weekday is correct — the professor's sheet depends on it", () => {
  // 2026-09-04 is a Friday; 2026-09-05 a Saturday; 2026-09-06 a Sunday.
  assert.equal(parseLocalISO("2026-09-04").getDay(), 5);
  assert.equal(parseLocalISO("2026-09-05").getDay(), 6);
  assert.equal(parseLocalISO("2026-09-06").getDay(), 0);
});

test("a late-evening local time still reports today, not tomorrow", () => {
  // 23:30 local on Sep 4 — with toISOString() this would already be Sep 5 UTC.
  const lateNight = new Date(2026, 8, 4, 23, 30, 0);
  assert.equal(toLocalISO(lateNight), "2026-09-04");
});

test("humanDayLabel names today, yesterday and tomorrow relative to a reference", () => {
  const today = "2026-09-04";
  assert.equal(humanDayLabel("2026-09-04", today), "Hoy");
  assert.equal(humanDayLabel("2026-09-03", today), "Ayer");
  assert.equal(humanDayLabel("2026-09-05", today), "Mañana");
});

test("humanDayLabel spells out any other date in Spanish", () => {
  assert.equal(humanDayLabel("2026-09-07", "2026-09-04"), "Lunes 7 de septiembre");
  assert.equal(humanDayLabel("2026-01-15", "2026-09-04"), "Jueves 15 de enero");
});

test("humanDayLabel handles month and year boundaries", () => {
  assert.equal(humanDayLabel("2025-12-31", "2026-01-01"), "Ayer");
  assert.equal(humanDayLabel("2026-01-01", "2025-12-31"), "Mañana");
});
