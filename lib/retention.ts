import type { Config, CuotaEstado, RiesgoNivel, Student } from "./types";
import { daysSince, daysUntil, isSameMonth } from "./dates";

export interface StudentSignals {
  estadoCuota: CuotaEstado;
  diasParaVencer: number | null; // negative = vencida
  diasSinVenir: number | null; // from ultimaAsistencia, or fechaFin as proxy
  diasSinVenirEsProxy: boolean; // true when derived from vencimiento (no attendance data)
  riesgo: RiesgoNivel;
  bucket: AusenciaBucket | null;
}

export type AusenciaBucket = "7" | "15" | "30" | "30plus";

/** Estado de la cuota relativo a hoy. */
export function getCuotaEstado(student: Student, config: Config): CuotaEstado {
  if (!student.fechaFin) {
    return student.membresia ? "vigente" : "sin_membresia";
  }
  const d = daysUntil(student.fechaFin);
  if (d == null) return "sin_membresia";
  if (d < 0) return "vencida";
  if (d <= config.porVencerDias) return "por_vencer";
  return "vigente";
}

/**
 * Días sin venir. Uses real attendance when available;
 * otherwise falls back to days since cuota expired (proxy).
 */
export function getDiasSinVenir(student: Student): { dias: number | null; esProxy: boolean } {
  if (student.ultimaAsistencia) {
    return { dias: daysSince(student.ultimaAsistencia), esProxy: false };
  }
  if (student.fechaFin) {
    const since = daysSince(student.fechaFin);
    if (since != null && since > 0) return { dias: since, esProxy: true };
  }
  return { dias: null, esProxy: false };
}

export function getBucket(dias: number | null, config: Config): AusenciaBucket | null {
  if (dias == null || dias < config.diasRiesgo.nivel1) return null;
  if (dias >= config.diasRiesgo.nivel3) {
    // distinguish exactly-30 vs >30 for the "+30" pile
    return dias > config.diasRiesgo.nivel3 ? "30plus" : "30";
  }
  if (dias >= config.diasRiesgo.nivel2) return "15";
  return "7";
}

export function getRiesgo(
  diasSinVenir: number | null,
  estadoCuota: CuotaEstado,
  config: Config,
): RiesgoNivel {
  const { nivel1, nivel2, nivel3 } = config.diasRiesgo;
  let score = 0;

  if (diasSinVenir != null) {
    if (diasSinVenir >= nivel3) score += 3;
    else if (diasSinVenir >= nivel2) score += 2;
    else if (diasSinVenir >= nivel1) score += 1;
  }
  if (estadoCuota === "vencida") score += 2;
  else if (estadoCuota === "por_vencer") score += 1;
  else if (estadoCuota === "sin_membresia") score += 1;

  if (score >= 5) return "critico";
  if (score >= 3) return "alto";
  if (score >= 2) return "medio";
  if (score >= 1) return "bajo";
  return "ok";
}

export function getSignals(student: Student, config: Config): StudentSignals {
  const estadoCuota = getCuotaEstado(student, config);
  const { dias, esProxy } = getDiasSinVenir(student);
  const riesgo = getRiesgo(dias, estadoCuota, config);
  return {
    estadoCuota,
    diasParaVencer: daysUntil(student.fechaFin),
    diasSinVenir: dias,
    diasSinVenirEsProxy: esProxy,
    riesgo,
    bucket: getBucket(dias, config),
  };
}

// ---- Aggregations ---------------------------------------------------------

export interface DashboardMetrics {
  total: number;
  habilitados: number;
  ausentes7: number;
  ausentes15: number;
  ausentes30: number;
  ausentes30plus: number;
  venceHoy: number;
  venceSemana: number;
  vencidas: number;
  enRiesgo: number;
  recuperadosMes: number;
  perdidos: number;
  porcentajeAsistencia: number;
  contactosMes: number;
}

export function computeMetrics(students: Student[], config: Config): DashboardMetrics {
  let ausentes7 = 0;
  let ausentes15 = 0;
  let ausentes30 = 0;
  let ausentes30plus = 0;
  let venceHoy = 0;
  let venceSemana = 0;
  let vencidas = 0;
  let enRiesgo = 0;
  let habilitados = 0;
  let asistentesRecientes = 0;
  let perdidos = 0;

  for (const s of students) {
    if (s.habilitado) habilitados++;
    const sig = getSignals(s, config);

    if (sig.bucket === "7") ausentes7++;
    else if (sig.bucket === "15") ausentes15++;
    else if (sig.bucket === "30") ausentes30++;
    else if (sig.bucket === "30plus") ausentes30plus++;

    if (sig.diasParaVencer === 0) venceHoy++;
    if (sig.diasParaVencer != null && sig.diasParaVencer > 0 && sig.diasParaVencer <= 7) venceSemana++;
    if (sig.estadoCuota === "vencida") vencidas++;

    if (sig.riesgo === "alto" || sig.riesgo === "critico") enRiesgo++;
    if (sig.diasSinVenir != null && sig.diasSinVenir <= config.diasRiesgo.nivel1 && !sig.diasSinVenirEsProxy) {
      asistentesRecientes++;
    }
    if (sig.diasSinVenir != null && sig.diasSinVenir > config.diasRiesgo.nivel3 && sig.estadoCuota === "vencida") {
      perdidos++;
    }
  }

  const recuperadosMes = students.filter((s) =>
    s.followUps.some((f) => f.resultado === "recuperado" && isSameMonth(f.fecha)),
  ).length;
  const contactosMes = students.reduce(
    (acc, s) => acc + s.followUps.filter((f) => isSameMonth(f.fecha)).length,
    0,
  );

  const conAsistencia = students.filter((s) => s.ultimaAsistencia).length;
  const porcentajeAsistencia = conAsistencia > 0 ? Math.round((asistentesRecientes / conAsistencia) * 100) : 0;

  return {
    total: students.length,
    habilitados,
    ausentes7,
    ausentes15,
    ausentes30,
    ausentes30plus,
    venceHoy,
    venceSemana,
    vencidas,
    enRiesgo,
    recuperadosMes,
    perdidos,
    porcentajeAsistencia,
    contactosMes,
  };
}

// ---- "Histórico completo" filter --------------------------------------
//
// A padrón importado desde un sistema legado suele traer TODO el histórico
// de socios que alguna vez pasaron por el gimnasio, no solo los actuales.
// Sin distinguirlos, el dashboard termina mostrando "vencidos"/"perdidos"
// sobre miles de personas que se fueron hace años — un número real, pero
// inútil para decidir a quién contactar hoy. Por default, la app solo
// cuenta socios "relevantes": sin fecha de vencimiento cargada (puede ser
// un alta reciente sin ese dato todavía) o con vencimiento dentro de los
// últimos `cutoffMonths` meses. El resto queda disponible activando "ver
// histórico completo".
export const HISTORICO_CUTOFF_MONTHS = 12;

export function isRelevantStudent(student: Student, cutoffMonths: number = HISTORICO_CUTOFF_MONTHS): boolean {
  if (!student.fechaFin) return true;
  const fechaFin = new Date(student.fechaFin);
  if (isNaN(fechaFin.getTime())) return true;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - cutoffMonths);
  return fechaFin >= cutoff;
}

export function filterRelevantStudents(
  students: Student[],
  cutoffMonths: number = HISTORICO_CUTOFF_MONTHS,
): Student[] {
  return students.filter((s) => isRelevantStudent(s, cutoffMonths));
}

/**
 * Narrows the roster down to just the students touched by one specific
 * import (nuevos + actualizados de ese archivo) — lets the panel show
 * exactly "lo que acabo de importar" instead of the whole cumulative base.
 */
export function filterByImport(students: Student[], importId: string | null): Student[] {
  if (!importId) return students;
  return students.filter((s) => s.lastImportId === importId);
}
