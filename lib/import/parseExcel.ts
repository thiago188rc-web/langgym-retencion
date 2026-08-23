import * as XLSX from "xlsx";
import type { CanonicalField, Config, ImportError, ImportResult, ParsedStudent } from "../types";
import { buildColumnMapping } from "./columnMapper";
import { sniffPositionalMapping } from "./sniffColumns";
import { cleanCell, normalizePhone, parseHabilitado, splitName } from "./normalize";
import { parseDate } from "../dates";

type RawRow = Record<string, unknown>;

/** Read the first sheet of a workbook into its raw row matrix (no header decided yet). */
function readMatrix(data: ArrayBuffer): unknown[][] {
  try {
    const wb = XLSX.read(data, { type: "array", cellDates: true });
    if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) return [];
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    if (!sheet) return [];

    return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: null });
  } catch (err) {
    console.warn("Could not parse workbook buffer:", err);
    return [];
  }
}

function rowsToObjects(matrix: unknown[][], headers: string[]): RawRow[] {
  const rows: RawRow[] = [];
  for (const arr of matrix) {
    if (!arr || arr.every((c) => c == null || String(c).trim() === "")) continue;
    const obj: RawRow = {};
    headers.forEach((h, i) => {
      obj[h] = arr[i] ?? null;
    });
    rows.push(obj);
  }
  return rows;
}

/**
 * Find a real header row by CONTENT, not position: scan the first several
 * rows and pick the first one whose cell text actually resolves both
 * required fields (idSocio, nombre) via name-based synonym matching. This
 * tolerates a title/date row above the real headers, and — crucially —
 * never mistakes a row of real DATA for a header just because it happens to
 * have 2+ non-empty cells (which used to silently swallow the first student
 * as "the header" on exports that have no header row at all).
 */
function findHeaderRow(matrix: unknown[][]): { headerIdx: number; headers: string[] } | null {
  const scanLimit = Math.min(matrix.length, 10);
  for (let i = 0; i < scanLimit; i++) {
    const raw = matrix[i] || [];
    const nonEmpty = raw.filter((c) => c != null && String(c).trim() !== "").length;
    if (nonEmpty < 2) continue;

    const headers = raw.map((h, idx) =>
      h == null || String(h).trim() === "" ? `Columna ${idx + 1}` : String(h).trim(),
    );
    const mapping = buildColumnMapping(headers);
    if (mapping.missingRequired.length === 0) {
      return { headerIdx: i, headers };
    }
  }
  return null;
}

function field(row: RawRow, byField: Partial<Record<CanonicalField, string>>, f: CanonicalField): unknown {
  const header = byField[f];
  return header ? row[header] : null;
}

/** Parse an ArrayBuffer of a SIGA Excel export (or a headerless raw dump) into structured students. */
export function parseExcel(data: ArrayBuffer, config: Config): ImportResult {
  const matrix = readMatrix(data);
  if (matrix.length === 0) {
    return {
      mapping: { byHeader: {}, byField: {}, unmapped: [], missingRequired: ["idSocio", "nombre"] },
      nuevos: 0,
      actualizados: 0,
      errores: [{ fila: 0, motivo: "El archivo está vacío o no se pudo leer.", datos: {} }],
      totalFilas: 0,
      parsedStudents: [],
    };
  }

  const headerMatch = findHeaderRow(matrix);

  let headers: string[];
  let rows: RawRow[];
  let mapping = headerMatch ? buildColumnMapping(headerMatch.headers) : null;
  let headerless = false;

  if (headerMatch && mapping && mapping.missingRequired.length === 0) {
    // Normal path: a real header row was found and it resolves idSocio + nombre.
    headers = headerMatch.headers;
    rows = rowsToObjects(matrix.slice(headerMatch.headerIdx + 1), headers);
  } else {
    // No row in the scanned window names its columns in a way we recognize —
    // most likely this is a raw export with NO header row at all (data
    // starts on row 1). Fall back to guessing columns from their VALUES
    // instead of failing outright.
    const sniffed = sniffPositionalMapping(matrix);
    if (!sniffed) {
      return {
        mapping: mapping ?? { byHeader: {}, byField: {}, unmapped: [], missingRequired: ["idSocio", "nombre"] },
        nuevos: 0,
        actualizados: 0,
        errores: [
          {
            fila: 0,
            motivo: "No se reconocieron columnas obligatorias: idSocio, nombre",
            datos: { primeraFila: matrix[0] ?? [] },
          },
        ],
        totalFilas: matrix.length,
        parsedStudents: [],
      };
    }

    headers = sniffed.headers;
    rows = rowsToObjects(matrix, headers);
    headerless = true;

    const fieldByHeader = new Map<string, CanonicalField>();
    for (const [f, h] of Object.entries(sniffed.byField) as [CanonicalField, string][]) {
      fieldByHeader.set(h, f);
    }
    const byHeader: Record<string, CanonicalField | null> = {};
    for (const h of headers) byHeader[h] = fieldByHeader.get(h) ?? null;

    mapping = {
      byHeader,
      byField: sniffed.byField,
      unmapped: headers.filter((h) => !fieldByHeader.has(h)),
      missingRequired: [],
    };
  }

  const errores: ImportError[] = [];
  const parsedStudents: ParsedStudent[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const fila = index + 2; // human row number (1 = header)
    const idSocioRaw = cleanCell(field(row, mapping!.byField, "idSocio"));
    const nombreRaw = cleanCell(field(row, mapping!.byField, "nombre"));

    if (!idSocioRaw && !nombreRaw) return; // empty row

    if (!idSocioRaw) {
      errores.push({ fila, motivo: "Falta idSocio", datos: row });
      return;
    }
    if (!nombreRaw) {
      errores.push({ fila, motivo: "Falta nombre", datos: row });
      return;
    }
    if (seen.has(idSocioRaw)) {
      errores.push({ fila, motivo: `idSocio duplicado en el archivo (${idSocioRaw})`, datos: row });
      return;
    }
    seen.add(idSocioRaw);

    const { nombre, apellido, nombreCompleto } = splitName(nombreRaw);
    const { telefono, telefonoRaw } = normalizePhone(
      cleanCell(field(row, mapping!.byField, "celular")),
      cleanCell(field(row, mapping!.byField, "telefono")),
      config,
    );

    parsedStudents.push({
      idSocio: idSocioRaw,
      nombre,
      apellido,
      nombreCompleto,
      telefono,
      telefonoRaw,
      email: cleanCell(field(row, mapping!.byField, "email")),
      habilitado: parseHabilitado(field(row, mapping!.byField, "habilitado")),
      idMembresia: cleanCell(field(row, mapping!.byField, "idMembresia")),
      membresia: cleanCell(field(row, mapping!.byField, "membresia")),
      fechaFin: parseDate(field(row, mapping!.byField, "fechaFin")),
      fechaAlta: parseDate(field(row, mapping!.byField, "fechaAlta")),
      ultimaAsistencia: parseDate(field(row, mapping!.byField, "ultimaAsistencia")),
      observacion: cleanCell(field(row, mapping!.byField, "observacion")),
    });
  });

  let unmappedSamples: Record<string, string[]> | undefined;
  if (mapping!.unmapped.length > 0) {
    unmappedSamples = {};
    for (const h of mapping!.unmapped) {
      const samples: string[] = [];
      for (const row of rows) {
        const v = row[h];
        if (v != null && String(v).trim() !== "") samples.push(String(v).trim());
        if (samples.length >= 3) break;
      }
      unmappedSamples[h] = samples;
    }
  }

  return {
    mapping: mapping!,
    nuevos: 0, // filled by reconciler
    actualizados: 0,
    errores,
    totalFilas: rows.length,
    parsedStudents,
    headerless,
    unmappedSamples,
  };
}
