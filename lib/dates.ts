/**
 * Date helpers. All internal dates are stored as ISO `yyyy-mm-dd` strings.
 * Comparisons are done at day granularity in local time.
 */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const DMY_RE = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/;

/** Excel serial date epoch (1899-12-30 to account for the 1900 leap bug). */
function excelSerialToISO(serial: number): string | null {
  if (!isFinite(serial) || serial <= 0) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Parse a value coming from Excel / SIGA into an ISO date string or null. */
export function parseDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return toLocalISO(value);
  }
  if (typeof value === "number") return excelSerialToISO(value);

  const raw = String(value).trim();
  if (!raw || raw === "-" || raw === "—" || raw.toLowerCase() === "n/a") return null;

  const iso = raw.match(ISO_RE);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = raw.match(DMY_RE);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (y.length === 2) y = (Number(y) > 70 ? "19" : "20") + y;
    const dd = d.padStart(2, "0");
    const mm = m.padStart(2, "0");
    if (Number(mm) > 12) return null;
    return `${y}-${mm}-${dd}`;
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) return toLocalISO(parsed);
  return null;
}

export function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toLocalISO(new Date());
}

function atMidnight(iso: string): number {
  const clean = iso.slice(0, 10);
  const [y, m, d] = clean.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** Whole days from `iso` until today. Past dates -> positive. */
export function daysSince(iso: string | null, ref = todayISO()): number | null {
  if (!iso) return null;
  return Math.round((atMidnight(ref) - atMidnight(iso)) / 86400000);
}

/** Whole days from today until `iso`. Future dates -> positive. */
export function daysUntil(iso: string | null, ref = todayISO()): number | null {
  if (!iso) return null;
  return Math.round((atMidnight(iso) - atMidnight(ref)) / 86400000);
}

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/** "15 mar 2026" */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const clean = iso.slice(0, 10);
  const [y, m, d] = clean.split("-").map(Number);
  return `${d} ${MONTHS_ES[m - 1]} ${y}`;
}

/** "15/03/2026" */
export function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  const clean = iso.slice(0, 10);
  const [y, m, d] = clean.split("-").map(Number);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/** "Mar 2026" */
export function formatMonthYear(iso: string | null): string {
  if (!iso) return "—";
  const clean = iso.slice(0, 10);
  const [y, m] = clean.split("-").map(Number);
  const mName = MONTHS_ES[m - 1] || "";
  return `${mName.charAt(0).toUpperCase() + mName.slice(1)} ${y}`;
}

/** "hoy" / "ayer" / "hace 5 días" / "en 3 días" */
export function relativeDays(iso: string | null): string {
  const since = daysSince(iso);
  if (since == null) return "sin datos";
  if (since === 0) return "hoy";
  if (since === 1) return "ayer";
  if (since === -1) return "mañana";
  if (since > 1) return `hace ${since} días`;
  return `en ${Math.abs(since)} días`;
}

export function isSameMonth(iso: string | null, ref = todayISO()): boolean {
  if (!iso) return false;
  return iso.slice(0, 7) === ref.slice(0, 7);
}
