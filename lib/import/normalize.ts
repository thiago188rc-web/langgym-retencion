import { toTitleCase } from "../utils";
import type { Config } from "../types";

const EMPTY_TOKENS = new Set(["", "-", "—", "–", "n/a", "na", "s/d", "sd", "null", "."]);

/** Treat SIGA placeholder values ("-", "", "n/a") as empty and sanitize input. */
export function cleanCell(value: unknown, maxLength = 500): string | null {
  if (value == null) return null;
  // Convert to string and remove null bytes / non-printable control chars (except standard whitespace)
  let s = String(value)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (s.length === 0) return null;
  if (EMPTY_TOKENS.has(s.toLowerCase())) return null;

  // Bound length to prevent buffer bloat
  if (s.length > maxLength) {
    s = s.slice(0, maxLength).trim();
  }

  return s;
}

/** Parse "Si"/"No"/"1"/"true" -> boolean (defaults to true). */
export function parseHabilitado(value: unknown): boolean {
  const s = cleanCell(value);
  if (s == null) return true;
  const n = s.toLowerCase();
  if (["no", "n", "0", "false", "inactivo", "deshabilitado"].includes(n)) return false;
  return true;
}

/**
 * Split a SIGA full name into apellido + nombre.
 * SIGA stores everything in one "Nombre" field, sometimes UPPERCASE.
 * Heuristic: 2 tokens -> "Nombre Apellido"; 3+ -> last two are apellido.
 */
export function splitName(full: string): { nombre: string; apellido: string; nombreCompleto: string } {
  const titled = toTitleCase(full.replace(/\s+/g, " ").trim());
  const tokens = titled.split(" ").filter(Boolean);

  if (tokens.length === 0) return { nombre: "", apellido: "", nombreCompleto: titled };
  if (tokens.length === 1) return { nombre: tokens[0], apellido: "", nombreCompleto: titled };
  if (tokens.length === 2) {
    return { nombre: tokens[0], apellido: tokens[1], nombreCompleto: titled };
  }
  // 3+ tokens: assume "Nombre(s) ... Apellido1 Apellido2"
  const apellido = tokens.slice(-2).join(" ");
  const nombre = tokens.slice(0, -2).join(" ");
  return { nombre, apellido, nombreCompleto: titled };
}

/** Keep only digits. */
function digits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Normalize an AR phone to a wa.me-ready international number.
 * Picks celular over telefono. Returns digits only (no "+").
 */
export function normalizePhone(
  celular: string | null,
  telefono: string | null,
  config: Config,
): { telefono: string | null; telefonoRaw: string | null } {
  const rawSource = celular ?? telefono;
  if (!rawSource) return { telefono: null, telefonoRaw: null };

  let d = digits(rawSource);
  if (!d) return { telefono: null, telefonoRaw: rawSource };

  d = d.replace(/^0+/, ""); // drop leading zeros (long-distance prefix)

  // Already includes country code.
  if (d.startsWith(config.countryCode) && d.length >= config.countryCode.length + 8) {
    return { telefono: d, telefonoRaw: rawSource };
  }

  // Too short to be a real number — keep raw, no wa.me number.
  if (d.length < 8) return { telefono: null, telefonoRaw: rawSource };

  const intl = `${config.countryCode}${config.mobilePrefix}${d}`;
  return { telefono: intl, telefonoRaw: rawSource };
}
