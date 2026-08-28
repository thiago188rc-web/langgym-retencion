// Run with: npx tsx --test tests/prioridad_include_all_test.ts
//
// Reproduces the real complaint: an import of 14 socios where only 2 had a
// vencimiento on file showed just those 2 in the panel, so the other 12 could
// not be messaged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getPrioridadHoy } from "../lib/selectors";
import { DEFAULT_CONFIG } from "../lib/config";
import type { Student } from "../lib/types";

function makeStudent(over: Partial<Student> & { id: string }): Student {
  return {
    idSocio: over.id,
    nombre: "Nombre",
    apellido: "Apellido",
    nombreCompleto: `Nombre ${over.id}`,
    telefono: "5492235550000",
    telefonoRaw: "2235550000",
    email: null,
    habilitado: true,
    idMembresia: null,
    membresia: "Pase libre",
    fechaFin: null,
    fechaAlta: null,
    ultimaAsistencia: null,
    observacion: null,
    lastImportId: "imp-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    snapshots: [],
    followUps: [],
    ...over,
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** 14 socios: 2 con cuota vencida, 3 sin teléfono, el resto al día. */
function buildImportedRoster(): Student[] {
  const vencidos = [
    makeStudent({ id: "vencido-1", nombreCompleto: "Zulema Vencida", fechaFin: daysAgo(61) }),
    makeStudent({ id: "vencido-2", nombreCompleto: "Yamil Vencido", fechaFin: daysAgo(61) }),
  ];
  const sinTelefono = [1, 2, 3].map((i) =>
    makeStudent({ id: `sin-tel-${i}`, nombreCompleto: `Sin Telefono ${i}`, telefono: null, telefonoRaw: null }),
  );
  const alDia = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) =>
    makeStudent({ id: `al-dia-${i}`, nombreCompleto: `Al Dia ${i}` }),
  );
  return [...vencidos, ...sinTelefono, ...alDia];
}

test("default triage mode only surfaces the at-risk socios (this was the reported symptom)", () => {
  const roster = buildImportedRoster();
  const result = getPrioridadHoy(roster, DEFAULT_CONFIG, 7);

  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((r) => r.student.id).sort(),
    ["vencido-1", "vencido-2"],
  );
});

test("includeAll returns every socio of the import, so all can be messaged", () => {
  const roster = buildImportedRoster();
  const result = getPrioridadHoy(roster, DEFAULT_CONFIG, roster.length, { includeAll: true });

  assert.equal(result.length, 14, "los 14 socios importados deben aparecer");
  assert.equal(new Set(result.map((r) => r.student.id)).size, 14, "sin duplicados");
});

test("includeAll keeps socios without a phone visible instead of dropping them", () => {
  const roster = buildImportedRoster();
  const result = getPrioridadHoy(roster, DEFAULT_CONFIG, roster.length, { includeAll: true });
  const ids = result.map((r) => r.student.id);

  for (const id of ["sin-tel-1", "sin-tel-2", "sin-tel-3"]) {
    assert.ok(ids.includes(id), `${id} debe seguir visible`);
  }
});

test("includeAll still puts the most urgent first", () => {
  const roster = buildImportedRoster();
  const result = getPrioridadHoy(roster, DEFAULT_CONFIG, roster.length, { includeAll: true });

  assert.deepEqual(
    result.slice(0, 2).map((r) => r.student.id).sort(),
    ["vencido-1", "vencido-2"],
    "los vencidos van arriba",
  );
});

test("includeAll ordering is stable across calls (no reshuffling between loads)", () => {
  const roster = buildImportedRoster();
  const a = getPrioridadHoy(roster, DEFAULT_CONFIG, roster.length, { includeAll: true });
  const b = getPrioridadHoy([...roster].reverse(), DEFAULT_CONFIG, roster.length, { includeAll: true });

  assert.deepEqual(a.map((r) => r.student.id), b.map((r) => r.student.id));
});
