import type { CanonicalField, ColumnMapping } from "../types";

/** Normalize a header: lowercase, strip accents, keep only a-z0-9. */
function normalizeHeader(h: string): string {
  return String(h)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Synonyms per canonical field. Order matters only for documentation;
 * matching is exact-on-normalized then includes-based as a fallback.
 */
const SYNONYMS: Record<CanonicalField, string[]> = {
  idSocio: ["idsocio", "id", "socio", "nrosocio", "nrodesocio", "legajo", "codigo", "idcliente"],
  nombre: ["nombre", "apellidoynombre", "nombreyapellido", "nombrecompleto", "apellidonombre", "apellido", "nombres", "cliente", "alumno"],
  habilitado: ["shabilitado", "habilitado", "habilit", "activo", "estado", "habilitacion"],
  idMembresia: ["idmembresia", "idmemb", "idplan"],
  membresia: ["descripcion", "membresia", "plan", "tipomembresia", "tipo", "cuota"],
  fechaFin: ["fechafin", "vencimiento", "vto", "fechavencimiento", "vtomembresia", "fechafinmembresia", "vence", "finmembresia"],
  fechaAlta: ["fechaalta", "alta", "fechaingreso", "ingreso", "fechadealta", "fecharegistro"],
  ultimaAsistencia: ["ultimaasistencia", "ultimoacceso", "ultacceso", "ultimoingreso", "ultingreso", "ultimaentrada", "fechaultimoacceso", "ultimavisita", "ultacc"],
  email: ["email", "mail", "correo", "correoelectronico", "e"],
  telefono: ["telefono", "tel", "te", "fijo", "telefonofijo"],
  celular: ["celular", "cel", "movil", "whatsapp", "wpp", "wsp", "telcelular"],
  observacion: ["obs", "observacion", "observaciones", "nota", "notas", "comentario", "comentarios"],
};

/** Fields the importer cannot function without. */
const REQUIRED: CanonicalField[] = ["idSocio", "nombre"];

/**
 * Build a mapping from raw header strings to canonical fields.
 * Tolerates reordered / renamed columns across SIGA exports.
 */
export function buildColumnMapping(headers: string[]): ColumnMapping {
  const byHeader: Record<string, CanonicalField | null> = {};
  const byField: Partial<Record<CanonicalField, string>> = {};
  const unmapped: string[] = [];

  // Pre-normalize every synonym once.
  const normalizedSynonyms: [CanonicalField, string[]][] = (
    Object.entries(SYNONYMS) as [CanonicalField, string[]][]
  ).map(([field, syns]) => [field, syns.map(normalizeHeader)]);

  for (const header of headers) {
    const norm = normalizeHeader(header);
    if (!norm) {
      byHeader[header] = null;
      unmapped.push(header);
      continue;
    }

    let matched: CanonicalField | null = null;

    // Pass 1: exact normalized match.
    for (const [field, syns] of normalizedSynonyms) {
      if (byField[field]) continue; // first wins
      if (syns.includes(norm)) {
        matched = field;
        break;
      }
    }

    // Pass 2: prefix/contains match (e.g. "fechafinmembresia" contains "fechafin").
    if (!matched) {
      for (const [field, syns] of normalizedSynonyms) {
        if (byField[field]) continue;
        if (syns.some((s) => s.length >= 3 && (norm.startsWith(s) || norm.includes(s)))) {
          matched = field;
          break;
        }
      }
    }

    byHeader[header] = matched;
    if (matched) {
      byField[matched] = header;
    } else {
      unmapped.push(header);
    }
  }

  const missingRequired = REQUIRED.filter((f) => !byField[f]);

  return { byHeader, byField, unmapped, missingRequired };
}

export { normalizeHeader, SYNONYMS, REQUIRED };