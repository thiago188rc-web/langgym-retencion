// Run with: npx tsx --test tests/historico_filter_test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isRelevantStudent, filterRelevantStudents, HISTORICO_CUTOFF_MONTHS } from "../lib/retention";
import type { Student } from "../lib/types";

function makeStudent(overrides: Partial<Student>): Student {
  return {
    id: "s1",
    idSocio: "1",
    nombre: "Test",
    apellido: "Student",
    nombreCompleto: "Test Student",
    telefono: null,
    telefonoRaw: null,
    email: null,
    habilitado: true,
    idMembresia: null,
    membresia: null,
    fechaFin: null,
    fechaAlta: null,
    ultimaAsistencia: null,
    observacion: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    snapshots: [],
    followUps: [],
    ...overrides,
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

test("students with no fecha_fin are always relevant (could be a recent alta without that data)", () => {
  const s = makeStudent({ fechaFin: null });
  assert.equal(isRelevantStudent(s), true);
});

test("students whose fecha_fin is recent (within cutoff) are relevant", () => {
  const s = makeStudent({ fechaFin: daysAgo(60) }); // 2 months ago
  assert.equal(isRelevantStudent(s), true);
});

test("students whose fecha_fin is far in the past (beyond cutoff) are NOT relevant", () => {
  const s = makeStudent({ fechaFin: daysAgo(400) }); // > 12 months
  assert.equal(isRelevantStudent(s), false);
});

test("cutoff is configurable", () => {
  const s = makeStudent({ fechaFin: daysAgo(100) });
  assert.equal(isRelevantStudent(s, 6), true); // within 6 months
  assert.equal(isRelevantStudent(s, 2), false); // beyond 2 months
});

test("filterRelevantStudents keeps only relevant ones, preserving the rest for the historico toggle", () => {
  const recent = makeStudent({ id: "recent", fechaFin: daysAgo(30) });
  const old = makeStudent({ id: "old", fechaFin: daysAgo(500) });
  const noData = makeStudent({ id: "no-data", fechaFin: null });

  const result = filterRelevantStudents([recent, old, noData]);
  const ids = result.map((s) => s.id);

  assert.ok(ids.includes("recent"));
  assert.ok(ids.includes("no-data"));
  assert.ok(!ids.includes("old"));
  assert.equal(result.length, 2);
});

test("default cutoff is 12 months, matching what's shown in the UI banner", () => {
  assert.equal(HISTORICO_CUTOFF_MONTHS, 12);
});
