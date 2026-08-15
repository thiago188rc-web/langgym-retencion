import * as XLSX from "xlsx";
import type { CanonicalField, Config, ImportError, ImportResult, ParsedStudent } from "../types";
import { buildColumnMapping } from "./columnMapper";
import { cleanCell, normalizePhone, parseHabilitado, splitName } from "./normalize";
import { parseDate } from "../dates";

type RawRow = Record<string, unknown>;

/** Read the first sheet of a workbook into headers + object rows. */
function readWorkbook(data: ArrayBuffer): { headers: string[]; rows: RawRow[] } {
  try {
    const wb = XLSX.read(data, { type: "array", cellDates: true });
    if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
      return { headers: [], rows: [] };
    }
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    if (!sheet) return { headers: [], rows: [] };

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: null,
    });
    if (matrix.length === 0) return { headers: [], rows: [] };

    // Find the header row: first row with >= 2 non-empty string-ish cells.
    let headerIdx = 0;
    for (let i = 0; i < Math.min(matrix.length, 10); i++) {
      const nonEmpty = matrix[i]?.filter((c) => c != null && String(c).trim() !== "").length ?? 0;
      if (nonEmpty >= 2) {
        headerIdx = i;
        break;
      }
    }

    const headers = (matrix[headerIdx] || []).map((h, i) =>
      h == null || String(h).trim() === "" ? `Columna ${i + 1}` : String(h).trim(),
    );

    const rows: RawRow[] = [];
    for (let r = headerIdx + 1; r < matrix.length; r++) {
      const arr = matrix[r];
      if (!arr || arr.every((c) => c == null || String(c).trim() === "")) continue;
      const obj: RawRow = {};
      headers.forEach((h, i) => {
        obj[h] = arr[i] ?? null;
      });
      rows.push(obj);
    }

    return { headers, rows };
  } catch (err) {
    console.warn("Could not parse workbook buffer:", err);
    return { headers: [], rows: [] };
  }
}

function field(row: RawRow, byField: Partial<Record<CanonicalField, string>>, f: CanonicalField): unknown {
  const header = byField[f];
  return header ? row[header] : null;
}

/** Parse an ArrayBuffer of a SIGA Excel export into structured students. */
export function parseExcel(data: ArrayBuffer, config: Config): ImportResult {
  const { headers, rows } = readWorkbook(data);
  const mapping = buildColumnMapping(headers);

  const errores: ImportError[] = [];
  const parsedStudents: ParsedStudent[] = [];
  const seen = new Set<string>();

  if (mapping.missingRequired.length > 0) {
    return {
      mapping,
      nuevos: 0,
      actualizados: 0,
      errores: [
        {
          fila: 0,
          motivo: `No se reconocieron columnas obligatorias: ${mapping.missingRequired.join(", ")}`,
          datos: { headers },
        },
      ],
      totalFilas: rows.length,
      parsedStudents: [],
    };
  }

  rows.forEach((row, index) => {
    const fila = index + 2; // human row number (1 = header)
    const idSocioRaw = cleanCell(field(row, mapping.byField, "idSocio"));
    const nombreRaw = cleanCell(field(row, mapping.byField, "nombre"));

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
      cleanCell(field(row, mapping.byField, "celular")),
      cleanCell(field(row, mapping.byField, "telefono")),
      config,
    );

    parsedStudents.push({
      idSocio: idSocioRaw,
      nombre,
      apellido,
      nombreCompleto,
      telefono,
      telefonoRaw,
      email: cleanCell(field(row, mapping.byField, "email")),
      habilitado: parseHabilitado(field(row, mapping.byField, "habilitado")),
      idMembresia: cleanCell(field(row, mapping.byField, "idMembresia")),
      membresia: cleanCell(field(row, mapping.byField, "membresia")),
      fechaFin: parseDate(field(row, mapping.byField, "fechaFin")),
      fechaAlta: parseDate(field(row, mapping.byField, "fechaAlta")),
      ultimaAsistencia: parseDate(field(row, mapping.byField, "ultimaAsistencia")),
      observacion: cleanCell(field(row, mapping.byField, "observacion")),
    });
  });

  return {
    mapping,
    nuevos: 0, // filled by reconciler
    actualizados: 0,
    errores,
    totalFilas: rows.length,
    parsedStudents,
  };
}
