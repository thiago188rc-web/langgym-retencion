"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CalendarX2,
  CircleAlert,
  Flame,
  HeartPulse,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  UserMinus,
  Activity,
  ArrowRight,
  Users,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { computeMetrics, filterRelevantStudents, filterByImport } from "@/lib/retention";
import { getPrioridadHoy } from "@/lib/selectors";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { PriorityRow } from "@/components/dashboard/PriorityRow";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { NoData } from "@/components/NoData";
import { HistoricoFilterBanner } from "@/components/shared/HistoricoFilterBanner";
import { LastImportFilterBanner } from "@/components/shared/LastImportFilterBanner";
import { PanelLoading } from "@/components/shared/PanelLoading";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 mt-1 text-[12px] font-semibold uppercase tracking-wider text-faint">
      {children}
    </h2>
  );
}

export default function DashboardPage() {
  const allStudents = useStore((s) => s.students);
  const config = useStore((s) => s.config);
  const showHistorico = useStore((s) => s.showHistorico);
  const showOnlyLastImport = useStore((s) => s.showOnlyLastImport);
  const latestImportId = useStore((s) => s.latestImportId);
  const hasSyncedOnce = useStore((s) => s.hasSyncedOnce);
  const isLoadingFromSupabase = useStore((s) => s.isLoadingFromSupabase);

  const importFiltered = useMemo(
    () => (showOnlyLastImport ? filterByImport(allStudents, latestImportId) : allStudents),
    [allStudents, showOnlyLastImport, latestImportId],
  );

  const students = useMemo(() => {
    // "Solo última importación" ya es una selección explícita del usuario —
    // no le vuelvas a aplicar el filtro de histórico encima, o alguien con
    // membresías vencidas hace tiempo en su archivo recién importado
    // desaparece del panel sin explicación.
    if (showOnlyLastImport) return importFiltered;
    return showHistorico ? importFiltered : filterRelevantStudents(importFiltered);
  }, [importFiltered, showHistorico, showOnlyLastImport]);

  const m = useMemo(() => {
    if (students.length === 0) return null;
    return computeMetrics(students, config);
  }, [students, config]);

  const prioridad = useMemo(() => {
    if (students.length === 0) return [];
    // Viendo una importación puntual: mostrá TODOS los socios de ese archivo
    // para poder escribirles, no solo los que están en riesgo.
    if (showOnlyLastImport) {
      return getPrioridadHoy(students, config, students.length, { includeAll: true });
    }
    return getPrioridadHoy(students, config, 7);
  }, [students, config, showOnlyLastImport]);

  if (!hasSyncedOnce && isLoadingFromSupabase) return <PanelLoading />;
  if (allStudents.length === 0) return <NoData />;

  return (
    <div className="space-y-8">
      <LastImportFilterBanner totalCount={allStudents.length} filteredCount={importFiltered.length} />
      <HistoricoFilterBanner totalCount={importFiltered.length} relevantCount={students.length} />

      {students.length === 0 || !m ? (
        <EmptyState
          icon={Users}
          title={showOnlyLastImport ? "Esta importación no trajo socios" : "No hay socios recientes"}
          description={
            showOnlyLastImport
              ? "El archivo no tiene socios cargados, o no se pudo asociar ninguno. Revisá el resumen de la importación."
              : "Todos tus socios importados vencieron hace más de 12 meses. Activá 'ver histórico completo' arriba para verlos."
          }
        />
      ) : (
      <>
      {/* Priority + headline */}
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="flex flex-col overflow-hidden" glow>
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-accent/12 text-accent">
                <Flame size={18} />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold">
                  {showOnlyLastImport ? "Socios de tu importación" : "A quién escribirle hoy"}
                </h2>
                <p className="text-[12px] text-muted">
                  {showOnlyLastImport
                    ? `${prioridad.length} socios · los más urgentes primero`
                    : prioridad.length > 0
                      ? `${prioridad.length} de ${students.length} socios necesitan contacto`
                      : "Ordenado por urgencia"}
                </p>
              </div>
            </div>
            <Link
              href="/recuperacion"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-accent transition-colors hover:text-accent-hover"
            >
              Ver todos <ArrowRight size={14} />
            </Link>
          </div>
          <div className="flex-1 p-2">
            {prioridad.length > 0 ? (
              <div className="space-y-0.5">
                {prioridad.map((item, i) => (
                  <PriorityRow key={item.student.id} item={item} index={i} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={HeartPulse}
                title="Todo bajo control"
                description="No hay alumnos urgentes para contactar hoy."
                className="border-0 py-12"
              />
            )}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-5 lg:grid-cols-1">
          <KpiCard
            label="Alumnos en riesgo de abandono"
            value={m.enRiesgo}
            icon={CircleAlert}
            tone="danger"
            href="/recuperacion"
            hint="Riesgo alto o crítico"
            highlight
            index={0}
          />
          <KpiCard
            label="Porcentaje de asistencia"
            value={m.porcentajeAsistencia}
            suffix="%"
            icon={Activity}
            tone="accent"
            hint="Activos vs. base con asistencia"
            index={1}
          />
        </div>
      </div>

      {/* Dejaron de venir */}
      <section>
        <SectionTitle>Dejaron de venir</SectionTitle>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Hace +7 días" value={m.ausentes7} icon={CalendarClock} tone="warning" href="/recuperacion" index={0} />
          <KpiCard label="Hace +15 días" value={m.ausentes15} icon={CalendarClock} tone="warning" href="/recuperacion" index={1} />
          <KpiCard label="Hace +30 días" value={m.ausentes30} icon={CalendarX2} tone="danger" href="/recuperacion" index={2} />
          <KpiCard label="Más de 30 días" value={m.ausentes30plus} icon={UserMinus} tone="danger" href="/recuperacion" index={3} />
        </div>
      </section>

      {/* Cobros */}
      <section>
        <SectionTitle>Cobros</SectionTitle>
        <div className="grid gap-5 sm:grid-cols-3">
          <KpiCard label="Cuotas que vencen hoy" value={m.venceHoy} icon={CalendarClock} tone="warning" href="/cobros" index={0} />
          <KpiCard label="Vencen esta semana" value={m.venceSemana} icon={CalendarClock} tone="info" href="/cobros" index={1} />
          <KpiCard label="Cuotas vencidas" value={m.vencidas} icon={CalendarX2} tone="danger" href="/cobros" index={2} />
        </div>
      </section>

      {/* Resultado del mes */}
      <section>
        <SectionTitle>Resultado del mes</SectionTitle>
        <div className="grid gap-5 sm:grid-cols-3">
          <KpiCard label="Recuperados este mes" value={m.recuperadosMes} icon={TrendingUp} tone="success" href="/metricas" index={0} />
          <KpiCard label="Alumnos perdidos" value={m.perdidos} icon={TrendingDown} tone="danger" href="/metricas" index={1} />
          <KpiCard label="Contactos realizados" value={m.contactosMes} icon={PiggyBank} tone="accent" href="/metricas" index={2} />
        </div>
      </section>
      </>
      )}
    </div>
  );
}