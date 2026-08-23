// Unit tests for the headerless-import fallback (raw exports with NO header
// row) and the "don't overwrite existing data with null for fields this
// import doesn't have" reconciliation fix.
//
// Run with: npx tsx --test tests/import_headerless_test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExcel } from "../lib/import/parseExcel";
import { DEFAULT_CONFIG } from "../lib/config";
import { sniffPositionalMapping } from "../lib/import/sniffColumns";
import * as XLSX from "xlsx";

function bufferFromRows(rows: unknown[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return out as ArrayBuffer;
}

test("parseExcel: file WITH a real header row still uses name-based mapping (no regression)", () => {
  const buf = bufferFromRows([
    ["idSocio", "Nombre", "Habilitado", "Celular"],
    [101, "Juan Perez", "Si", "2235031683"],
    [102, "Maria Lopez", "No", "2235031684"],
  ]);
  const result = parseExcel(buf, DEFAULT_CONFIG);
  assert.equal(result.mapping.missingRequired.length, 0);
  assert.equal(result.parsedStudents.length, 2);
  assert.equal(result.parsedStudents[0].idSocio, "101");
  assert.equal(result.parsedStudents[0].nombre, "Juan");
});

test("parseExcel: headerless raw dump (data starts at row 0) is recognized via content sniffing", () => {
  const buf = bufferFromRows([
    [4590, "Alejo Rodriguez", "Si", 2, "Pase libre", "", "2235031683", ""],
    [759, "Silvia Burdet", "Si", 6, "FLEXI RUN + GYM", "", "", "2234370106"],
    [3004, "Antonela Presenza", "Si", 2, "Pase libre", "", "", "2235953482"],
  ]);
  const result = parseExcel(buf, DEFAULT_CONFIG);

  assert.equal(result.mapping.missingRequired.length, 0, "must recognize idSocio + nombre without any header row");
  assert.equal(result.errores.length, 0);
  assert.equal(result.parsedStudents.length, 3, "no row should be silently swallowed as a fake header");

  const first = result.parsedStudents.find((s) => s.idSocio === "4590");
  assert.ok(first, "the first data row must survive as a real student, not get eaten as 'the header'");
  assert.equal(first!.nombreCompleto, "Alejo Rodriguez");
  assert.equal(first!.habilitado, true);
  assert.equal(first!.membresia, "Pase libre");
});

test("parseExcel: still fails clearly when the file truly has no recognizable id/nombre columns", () => {
  const buf = bufferFromRows([
    [1.5, 2.75, 3.1],
    [4.2, 5.9, 6.6],
  ]);
  const result = parseExcel(buf, DEFAULT_CONFIG);
  assert.ok(result.mapping.missingRequired.length > 0);
  assert.equal(result.parsedStudents.length, 0);
  assert.equal(result.errores.length, 1);
});

test("sniffPositionalMapping: never auto-maps an ambiguous date column to a specific date field", () => {
  const rows = [
    [1, "Ana Gomez", "Si", "2026-06-27T00:00:00.000Z"],
    [2, "Beto Diaz", "Si", "2026-08-21T00:00:00.000Z"],
    [3, "Caro Ruiz", "No", "2026-08-17T00:00:00.000Z"],
  ];
  const sniffed = sniffPositionalMapping(rows);
  assert.ok(sniffed);
  assert.equal(sniffed!.byField.fechaFin, undefined, "date columns must stay unmapped without a header to confirm their meaning");
  assert.equal(sniffed!.byField.fechaAlta, undefined);
  assert.equal(sniffed!.byField.ultimaAsistencia, undefined);
});

test("sniffPositionalMapping: distinguishes a categorical membresia column from a date column", () => {
  const names = [
    "Ana Gomez", "Beto Diaz", "Caro Ruiz", "Dario Perez", "Elena Lopez",
    "Facundo Suarez", "Gaby Rojas", "Hugo Cruz", "Ines Nunez", "Juan Vega",
    "Karla Ibanez", "Leo Molina",
  ];
  const planes = ["Pase libre", "Funcional x3", "Pase libre", "Yoga"];
  const rows: unknown[][] = names.map((nombre, i) => [
    1000 + i,
    nombre,
    "Si",
    planes[i % planes.length],
    "2026-08-21T03:00:48.000Z",
  ]);
  const sniffed = sniffPositionalMapping(rows);
  assert.ok(sniffed);
  assert.equal(sniffed!.byField.membresia, "Columna 4", "the repeating plan-name column must win membresia, not the date column");
});
