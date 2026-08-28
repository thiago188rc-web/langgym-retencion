import type { Config, Student } from "./types";
import { getSignals, type AusenciaBucket, type StudentSignals } from "./retention";

export interface StudentWithSignals {
  student: Student;
  signals: StudentSignals;
}

const RIESGO_ORDER = { critico: 4, alto: 3, medio: 2, bajo: 1, ok: 0 };

export function withSignals(students: Student[], config: Config): StudentWithSignals[] {
  return students.map((student) => ({ student, signals: getSignals(student, config) }));
}

/** Ausentes (recuperación), sorted by most days absent. */
export function getAusentes(students: Student[], config: Config): StudentWithSignals[] {
  return withSignals(students, config)
    .filter((x) => x.signals.bucket != null)
    .sort((a, b) => (b.signals.diasSinVenir ?? 0) - (a.signals.diasSinVenir ?? 0));
}

export function groupByBucket(items: StudentWithSignals[]): Record<AusenciaBucket, StudentWithSignals[]> {
  const groups: Record<AusenciaBucket, StudentWithSignals[]> = {
    "7": [],
    "15": [],
    "30": [],
    "30plus": [],
  };
  for (const item of items) {
    if (item.signals.bucket) groups[item.signals.bucket].push(item);
  }
  return groups;
}

export interface CobrosBuckets {
  hoy: StudentWithSignals[];
  semana: StudentWithSignals[];
  vencidas: StudentWithSignals[];
}

export function getCobros(students: Student[], config: Config): CobrosBuckets {
  const all = withSignals(students, config);
  const hoy = all.filter((x) => x.signals.diasParaVencer === 0);
  const semana = all.filter(
    (x) => x.signals.diasParaVencer != null && x.signals.diasParaVencer > 0 && x.signals.diasParaVencer <= 7,
  );
  const vencidas = all
    .filter((x) => x.signals.estadoCuota === "vencida")
    .sort((a, b) => (a.signals.diasParaVencer ?? 0) - (b.signals.diasParaVencer ?? 0));
  return { hoy, semana, vencidas };
}

/**
 * Students to contact, ranked by urgency (most urgent first).
 *
 * By default this is a triage list: only alumnos at high/critical risk or
 * whose cuota expires today, and only those with a phone. Pass
 * `includeAll` when the caller has ALREADY narrowed the set deliberately
 * (e.g. "solo esta importación") — there, hiding the people who happen to be
 * up to date is wrong: the user picked that list precisely to message it, and
 * silently dropping 12 of 14 just looks broken. Students without a phone are
 * kept too in that mode, so they're visibly accounted for (the WhatsApp
 * button renders a "Sin teléfono" state) instead of vanishing.
 */
export function getPrioridadHoy(
  students: Student[],
  config: Config,
  limit = 6,
  opts: { includeAll?: boolean } = {},
): StudentWithSignals[] {
  const all = withSignals(students, config);
  const candidates = opts.includeAll
    ? all
    : all
        .filter(
          (x) =>
            x.signals.riesgo === "alto" ||
            x.signals.riesgo === "critico" ||
            x.signals.diasParaVencer === 0,
        )
        .filter((x) => x.student.telefono != null);

  return candidates
    .sort((a, b) => {
      const r = RIESGO_ORDER[b.signals.riesgo] - RIESGO_ORDER[a.signals.riesgo];
      if (r !== 0) return r;
      const d = (b.signals.diasSinVenir ?? 0) - (a.signals.diasSinVenir ?? 0);
      if (d !== 0) return d;
      // Stable, predictable order for everyone left (typically the "al día"
      // bulk in includeAll mode), so the list doesn't reshuffle between loads.
      return a.student.nombreCompleto.localeCompare(b.student.nombreCompleto);
    })
    .slice(0, limit);
}