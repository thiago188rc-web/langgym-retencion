import type { CanonicalField } from "../types";

/**
 * Content-based column mapper for spreadsheets that have NO header row at
 * all — data starts right at the first row (a raw system dump, not a
 * proper export). Used as a fallback only when name-based header matching
 * (columnMapper.ts) can't find a row that maps the required fields, so
 * these files still import correctly instead of the whole first row being
 * silently swallowed as a fake "header" and idSocio/nombre never matching.
 *
 * Each field gets a confidence score per column purely from its VALUES
 * (all-digit + unique -> looks like an id, repeating "Si"/"No" -> looks
 * like habilitado, etc.) and the best-scoring, still-unclaimed column above
 * a minimum threshold wins. Required fields (idSocio, nombre) are assigned
 * first with a stricter bar; if either can't be found with confidence,
 * sniffing fails and the caller falls back to the normal error message.
 */

type Col = unknown[];

function nonEmptyValues(col: Col): string[] {
  return col.filter((v) => v != null && String(v).trim() !== "").map((v) => String(v).trim());
}

function fillRatio(col: Col): number {
  return nonEmptyValues(col).length / Math.max(col.length, 1);
}

function uniquenessRatio(col: Col): number {
  const vals = nonEmptyValues(col).map((v) => v.toLowerCase());
  if (vals.length === 0) return 0;
  return new Set(vals).size / vals.length;
}

function matchRatio(col: Col, test: (v: string) => boolean): number {
  const vals = nonEmptyValues(col);
  if (vals.length === 0) return 0;
  return vals.filter(test).length / vals.length;
}

const HABILITADO_SET = new Set(["si", "sí", "no", "activo", "inactivo", "true", "false", "1", "0"]);
const DIGITS_RE = /^\d+$/;
const PHONE_RE = /^\+?[\d\s().-]{7,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ'’.\- ]+$/;

function scoreIdSocio(col: Col): number {
  if (fillRatio(col) < 0.8) return 0;
  return matchRatio(col, (v) => DIGITS_RE.test(v)) * uniquenessRatio(col);
}

function scoreNombre(col: Col): number {
  if (fillRatio(col) < 0.6) return 0;
  const nameScore = matchRatio(
    col,
    (v) => NAME_RE.test(v) && v.trim().split(/\s+/).length >= 2 && v.trim().length >= 5,
  );
  return nameScore * Math.max(uniquenessRatio(col), 0.5);
}

function scoreMembresia(col: Col): number {
  if (fillRatio(col) < 0.5) return 0;
  // A stringified date ("Fri Aug 21 2026...") also contains letters, so
  // explicitly rule out date-shaped columns here — those belong to
  // scoreFecha instead, not to a plan/membership description.
  if (matchRatio(col, (v) => !isNaN(Date.parse(v))) > 0.5) return 0;
  const wordScore = matchRatio(col, (v) => /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(v));
  return wordScore * (1 - uniquenessRatio(col)); // categorical: values repeat across students
}

function scoreHabilitado(col: Col): number {
  if (fillRatio(col) < 0.5) return 0;
  return matchRatio(col, (v) => HABILITADO_SET.has(v.toLowerCase()));
}

function scoreIdMembresia(col: Col): number {
  if (fillRatio(col) < 0.5) return 0;
  return matchRatio(col, (v) => DIGITS_RE.test(v)) * (1 - uniquenessRatio(col)); // plan ids repeat
}

function scorePhone(col: Col): number {
  const vals = nonEmptyValues(col);
  if (vals.length === 0) return 0;
  return matchRatio(col, (v) => PHONE_RE.test(v) && v.replace(/\D/g, "").length >= 7);
}

function scoreEmail(col: Col): number {
  const vals = nonEmptyValues(col);
  if (vals.length === 0) return 0;
  return matchRatio(col, (v) => EMAIL_RE.test(v));
}

export interface SniffedMapping {
  byField: Partial<Record<CanonicalField, string>>;
  headers: string[];
}

export function sniffPositionalMapping(rows: unknown[][]): SniffedMapping | null {
  if (rows.length === 0) return null;
  const numCols = Math.max(...rows.map((r) => r.length));
  if (numCols === 0) return null;

  const sample = rows.slice(0, Math.min(rows.length, 200));
  const columns: Col[] = [];
  for (let c = 0; c < numCols; c++) columns.push(sample.map((r) => r[c] ?? null));

  const headers = columns.map((_, i) => `Columna ${i + 1}`);
  const used = new Set<number>();

  function bestColumn(scoreFn: (col: Col) => number, threshold: number): number {
    let bestIdx = -1;
    let bestScore = threshold;
    columns.forEach((col, i) => {
      if (used.has(i)) return;
      const s = scoreFn(col);
      if (s > bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    });
    return bestIdx;
  }

  const byField: Partial<Record<CanonicalField, string>> = {};

  // Required fields first, with a meaningful confidence bar — if either is
  // missing, this file just isn't a recognizable headerless student list.
  const idCol = bestColumn(scoreIdSocio, 0.6);
  if (idCol === -1) return null;
  byField.idSocio = headers[idCol];
  used.add(idCol);

  const nameCol = bestColumn(scoreNombre, 0.6);
  if (nameCol === -1) return null;
  byField.nombre = headers[nameCol];
  used.add(nameCol);

  // Optional fields — best-effort; a field is simply left unmapped (visible
  // to the user as an ignored/unmapped column) if nothing is confident.
  const optionalPasses: [CanonicalField, (col: Col) => number, number][] = [
    ["habilitado", scoreHabilitado, 0.7],
    ["idMembresia", scoreIdMembresia, 0.6],
    ["email", scoreEmail, 0.8],
    ["celular", scorePhone, 0.6],
    ["telefono", scorePhone, 0.6],
    ["membresia", scoreMembresia, 0.3],
  ];
  // Dates (fechaFin/fechaAlta/ultimaAsistencia) are deliberately NOT
  // auto-mapped here: without a header naming the column, there's no
  // reliable way to tell which of several possible date meanings a raw
  // value represents, and guessing wrong directly corrupts membership
  // vencimiento / risk classification. Any date-looking column is simply
  // left unmapped for a human to confirm.
  for (const [field, scoreFn, threshold] of optionalPasses) {
    const idx = bestColumn(scoreFn, threshold);
    if (idx !== -1) {
      byField[field] = headers[idx];
      used.add(idx);
    }
  }

  return { byField, headers };
}
