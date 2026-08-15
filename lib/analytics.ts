import type {
  Student,
  ImportRecord,
  PeriodFilter,
  PeriodMetric,
  BajaStudent,
  AnalyticsSummary,
  Config,
} from "./types";
import { formatMonthYear, formatShortDate, daysSince } from "./dates";

/**
 * Filter imports based on selected period.
 */
export function filterImportsByPeriod(
  imports: ImportRecord[],
  period: PeriodFilter,
): ImportRecord[] {
  if (!imports || imports.length === 0) return [];
  if (period === "todo") return imports;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11

  return imports.filter((imp) => {
    const impDate = new Date(imp.fecha);
    const impYear = impDate.getFullYear();
    const impMonth = impDate.getMonth();

    if (period === "este_mes") {
      return impYear === currentYear && impMonth === currentMonth;
    }

    if (period === "mes_anterior") {
      const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
      return (
        impYear === prevMonthDate.getFullYear() &&
        impMonth === prevMonthDate.getMonth()
      );
    }

    if (period === "ultimos_3_meses") {
      const cutoff = new Date(currentYear, currentMonth - 3, 1);
      return impDate >= cutoff;
    }

    if (period === "ultimos_6_meses") {
      const cutoff = new Date(currentYear, currentMonth - 6, 1);
      return impDate >= cutoff;
    }

    if (period === "ultimo_ano") {
      const cutoff = new Date(currentYear - 1, currentMonth, 1);
      return impDate >= cutoff;
    }

    return true;
  });
}

/**
 * Main analytics computation engine.
 */
export function computeAnalytics(
  students: Student[],
  rawImports: ImportRecord[],
  selectedPeriod: PeriodFilter = "todo",
  config?: Config,
): AnalyticsSummary {
  // Sort all imports chronologically (oldest first for progression)
  const chronologicalImports = [...rawImports].sort(
    (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
  );

  const totalImports = chronologicalImports.length;
  const latestImport =
    chronologicalImports.length > 0
      ? chronologicalImports[chronologicalImports.length - 1]
      : null;

  if (totalImports === 0) {
    return {
      alumnosActuales: students.length,
      altas: 0,
      bajas: 0,
      tasaBaja: null,
      tasaRetencion: null,
      crecimientoNeto: 0,
      totalImportaciones: 0,
      ultimaImportacionFecha: null,
      evolucion: [],
      bajasList: [],
      hasSufficientData: false,
      periodoSeleccionado: selectedPeriod,
    };
  }

  // 1. Compute sequential evolution for each import record
  const evolucion: PeriodMetric[] = [];

  for (let i = 0; i < chronologicalImports.length; i++) {
    const current = chronologicalImports[i];
    const prev = i > 0 ? chronologicalImports[i - 1] : null;

    const total = current.total;
    const altas = current.nuevos;

    // Bajas: either stored in record or derived from difference: prev.total + altas - current.total
    let bajas = 0;
    if (prev != null) {
      if (typeof current.bajas === "number") {
        bajas = current.bajas;
      } else {
        bajas = Math.max(0, prev.total + altas - total);
      }
    }

    const permanecen = current.permanecen ?? Math.max(0, total - altas);
    const neto = altas - bajas;

    let tasaBaja: number | null = null;
    let tasaRetencion: number | null = null;

    if (prev != null && prev.total > 0) {
      tasaBaja = Math.min(100, Math.max(0, Math.round((bajas / prev.total) * 1000) / 10));
      tasaRetencion = Math.min(100, Math.max(0, Math.round((permanecen / prev.total) * 1000) / 10));
    }

    const dateObj = new Date(current.fecha);
    const monthName = dateObj.toLocaleDateString("es-AR", { month: "short" }).toUpperCase().replace(".", "");
    const yearStr = dateObj.getFullYear();
    const label = `${monthName} ${yearStr}`;

    evolucion.push({
      periodKey: current.id,
      label,
      fecha: current.fecha,
      archivo: current.archivo,
      total,
      altas,
      bajas,
      permanecen,
      neto,
      tasaBaja,
      tasaRetencion,
    });
  }

  // 2. Identify Bajas List
  // A student is considered "Baja / No presente en última importación" if:
  // - There have been at least 2 imports, AND
  // - The student's latest snapshot or update date is prior to the latest import date, OR student is not enabled.
  const bajasList: BajaStudent[] = [];

  if (totalImports >= 2 && latestImport) {
    const latestDate = new Date(latestImport.fecha).getTime();
    // Tolerance window (1 minute) for same-batch snapshots
    const cutoffTime = latestDate - 60000;

    for (const st of students) {
      let isPresentInLatest = false;

      if (st.snapshots && st.snapshots.length > 0) {
        const latestSnap = st.snapshots[st.snapshots.length - 1];
        const snapTime = new Date(latestSnap.fecha).getTime();
        if (snapTime >= cutoffTime) {
          isPresentInLatest = true;
        }
      } else {
        // If no snapshots, check updatedAt
        const updatedTime = new Date(st.updatedAt).getTime();
        if (updatedTime >= cutoffTime) {
          isPresentInLatest = true;
        }
      }

      if (!isPresentInLatest || !st.habilitado) {
        const lastFollowUp = st.followUps && st.followUps.length > 0
          ? st.followUps[st.followUps.length - 1]
          : undefined;

        let ultimoVencimiento: string | null = null;
        if (st.fechaFin) {
          ultimoVencimiento = formatShortDate(st.fechaFin);
        }

        let diasSinVenir: number | null = null;
        if (st.ultimaAsistencia) {
          diasSinVenir = daysSince(st.ultimaAsistencia);
        } else if (st.fechaFin) {
          const s = daysSince(st.fechaFin);
          if (s != null && s > 0) diasSinVenir = s;
        }

        const lastSnapDate = st.snapshots && st.snapshots.length > 0
          ? st.snapshots[st.snapshots.length - 1].fecha
          : st.updatedAt;

        const bajaDate = new Date(latestImport.fecha);
        const bajaPeriodLabel = bajaDate.toLocaleDateString("es-AR", { month: "short", year: "numeric" });

        bajasList.push({
          student: st,
          idSocio: st.idSocio,
          nombreCompleto: st.nombreCompleto || `${st.nombre} ${st.apellido}`.trim(),
          telefono: st.telefono,
          telefonoRaw: st.telefonoRaw,
          fechaBajaDetectada: latestImport.fecha,
          periodoBaja: bajaPeriodLabel,
          ultimoEstado: !st.habilitado
            ? "Deshabilitado"
            : st.fechaFin && daysSince(st.fechaFin) != null && daysSince(st.fechaFin)! > 0
            ? "Cuota vencida / No renovó"
            : "No figura en última importación",
          ultimaMembresia: st.membresia,
          ultimoVencimiento,
          diasSinVenir,
          ultimoSeguimiento: lastFollowUp,
        });
      }
    }
  }

  // 3. Filter evolution according to selected period
  const filteredEvolucion = filterEvolucion(evolucion, selectedPeriod);

  // 4. Compute Top KPI Cards
  const alumnosActuales = latestImport ? latestImport.total : students.length;

  let altas = 0;
  let bajas = 0;
  let neto = 0;
  let tasaBaja: number | null = null;
  let tasaRetencion: number | null = null;

  if (totalImports >= 2) {
    if (selectedPeriod === "este_mes" || selectedPeriod === "mes_anterior" || selectedPeriod === "todo") {
      // Use metrics of the latest / selected period
      const targetMetric = filteredEvolucion.length > 0
        ? filteredEvolucion[filteredEvolucion.length - 1]
        : evolucion[evolucion.length - 1];

      if (targetMetric) {
        altas = targetMetric.altas;
        bajas = targetMetric.bajas;
        neto = targetMetric.neto;
        tasaBaja = targetMetric.tasaBaja;
        tasaRetencion = targetMetric.tasaRetencion;
      }
    } else {
      // Aggregate across the filtered range (e.g. ultimos 3 meses)
      altas = filteredEvolucion.reduce((acc, m) => acc + m.altas, 0);
      bajas = filteredEvolucion.reduce((acc, m) => acc + m.bajas, 0);
      neto = altas - bajas;

      // Base for retention: total of initial period in the range
      const baseInitial = filteredEvolucion.length > 0 && totalImports > 1
        ? evolucion[Math.max(0, evolucion.indexOf(filteredEvolucion[0]) - 1)]?.total ?? filteredEvolucion[0].total
        : alumnosActuales;

      if (baseInitial > 0) {
        tasaBaja = Math.min(100, Math.max(0, Math.round((bajas / baseInitial) * 1000) / 10));
        tasaRetencion = Math.min(100, Math.max(0, Math.round((100 - tasaBaja) * 10) / 10));
      }
    }
  } else {
    // Only 1 import
    altas = latestImport ? latestImport.nuevos : students.length;
    bajas = 0;
    neto = altas;
    tasaBaja = null;
    tasaRetencion = null;
  }

  return {
    alumnosActuales,
    altas,
    bajas,
    tasaBaja,
    tasaRetencion,
    crecimientoNeto: neto,
    totalImportaciones: totalImports,
    ultimaImportacionFecha: latestImport ? latestImport.fecha : null,
    evolucion: filteredEvolucion,
    bajasList,
    hasSufficientData: totalImports >= 2,
    periodoSeleccionado: selectedPeriod,
  };
}

function filterEvolucion(
  evolucion: PeriodMetric[],
  period: PeriodFilter,
): PeriodMetric[] {
  if (period === "todo" || evolucion.length === 0) return evolucion;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  return evolucion.filter((item) => {
    const d = new Date(item.fecha);
    const y = d.getFullYear();
    const m = d.getMonth();

    if (period === "este_mes") {
      return y === currentYear && m === currentMonth;
    }

    if (period === "mes_anterior") {
      const prevDate = new Date(currentYear, currentMonth - 1, 1);
      return y === prevDate.getFullYear() && m === prevDate.getMonth();
    }

    if (period === "ultimos_3_meses") {
      const cutoff = new Date(currentYear, currentMonth - 3, 1);
      return d >= cutoff;
    }

    if (period === "ultimos_6_meses") {
      const cutoff = new Date(currentYear, currentMonth - 6, 1);
      return d >= cutoff;
    }

    if (period === "ultimo_ano") {
      const cutoff = new Date(currentYear - 1, currentMonth, 1);
      return d >= cutoff;
    }

    return true;
  });
}
