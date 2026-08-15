"use client";

import { useState, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Users,
  UserPlus,
  UserMinus,
  ShieldCheck,
  Calendar,
  AlertCircle,
  FileSpreadsheet,
  Layers,
  Sparkles,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { computeMetrics, getSignals } from "@/lib/retention";
import { computeAnalytics } from "@/lib/analytics";
import { Card } from "@/components/ui/Card";
import { CountUp } from "@/components/ui/CountUp";
import { NoData } from "@/components/NoData";
import { MonthlyEvolutionChart } from "@/components/analytics/MonthlyEvolutionChart";
import { HistoricalImportsTable } from "@/components/analytics/HistoricalImportsTable";
import { BajasList } from "@/components/analytics/BajasList";
import { CUOTA_META } from "@/components/students/StatusBadges";
import type { CuotaEstado, PeriodFilter } from "@/lib/types";

function MetricStat({
  icon: Icon,
  value,
  suffix,
  prefix,
  label,
  sublabel,
  tone,
  index,
  isText,
}: {
  icon: typeof TrendingUp;
  value: number | string;
  suffix?: string;
  prefix?: string;
  label: string;
  sublabel?: string;
  tone: string;
  index: number;
  isText?: boolean;
}) {
  return (
    <Card className="p-5 animate-rise" style={{ animationDelay: `${index * 40}ms` }}>
      <div className="flex items-center justify-between">
        <div className={`flex size-10 items-center justify-center rounded-xl ${tone}`}>
          <Icon size={19} />
        </div>
        {sublabel && (
          <span className="text-[11px] font-medium text-faint uppercase tracking-wider">{sublabel}</span>
        )}
      </div>

      <div className="mt-4 text-[28px] font-semibold leading-none tracking-tight text-fg">
        {isText || typeof value === "string" ? (
          <span>{value}</span>
        ) : (
          <CountUp value={value} prefix={prefix} suffix={suffix} />
        )}
      </div>
      <div className="mt-2 text-[13px] text-muted">{label}</div>
    </Card>
  );
}

function BarRow({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[13px]">
        <span className="text-muted">{label}</span>
        <span className="tnum font-medium text-fg">
          {value} <span className="text-faint">· {pct}%</span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

const CUOTA_COLORS: Record<CuotaEstado, string> = {
  vigente: "#2ED477",
  por_vencer: "#FFB020",
  vencida: "#FF4D4D",
  sin_membresia: "#5B626D",
};

const PERIOD_OPTIONS: { id: PeriodFilter; label: string }[] = [
  { id: "todo", label: "Todo el historial" },
  { id: "este_mes", label: "Este mes" },
  { id: "mes_anterior", label: "Mes anterior" },
  { id: "ultimos_3_meses", label: "Últimos 3 meses" },
  { id: "ultimos_6_meses", label: "Últimos 6 meses" },
  { id: "ultimo_ano", label: "Último año" },
];

export default function MetricasPage() {
  const students = useStore((s) => s.students);
  const imports = useStore((s) => s.imports);
  const config = useStore((s) => s.config);

  const [period, setPeriod] = useState<PeriodFilter>("todo");
  const [activeTab, setActiveTab] = useState<"evolucion" | "bajas" | "cuotas">("evolucion");

  const analytics = useMemo(() => {
    return computeAnalytics(students, imports, period, config);
  }, [students, imports, period, config]);

  const retention = useMemo(() => {
    const m = computeMetrics(students, config);
    const cuotas: Record<CuotaEstado, number> = {
      vigente: 0,
      por_vencer: 0,
      vencida: 0,
      sin_membresia: 0,
    };
    for (const s of students) cuotas[getSignals(s, config).estadoCuota]++;
    const recuperaciones = students.reduce(
      (acc, s) => acc + s.followUps.filter((f) => f.resultado === "recuperado").length,
      0,
    );
    return { m, cuotas, recuperaciones };
  }, [students, config]);

  if (students.length === 0 && imports.length === 0) return <NoData />;

  const { m, cuotas } = retention;
  const ausentesTotal = m.ausentes7 + m.ausentes15 + m.ausentes30 + m.ausentes30plus;

  return (
    <div className="space-y-8">
      {/* Top Header Controls: Period Filter */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Calendar size={16} className="text-accent" />
          <span>Período de análisis:</span>
        </div>

        <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-card/60 p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setPeriod(opt.id)}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all ${
                period === opt.id
                  ? "bg-accent/15 text-accent font-semibold border border-accent/30 shadow-sm"
                  : "text-muted hover:text-fg"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cold start alert if only 1 import exists */}
      {!analytics.hasSufficientData && (
        <div className="flex items-start gap-3.5 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-warning">
          <AlertCircle size={20} className="mt-0.5 shrink-0 text-warning" />
          <div className="space-y-1">
            <h4 className="text-[14px] font-semibold text-warning">
              Se requiere al menos 2 importaciones para calcular evolución comparativa
            </h4>
            <p className="text-[13px] leading-relaxed text-fg/80">
              Actualmente disponés de <strong>1 importación válida ({analytics.alumnosActuales} alumnos)</strong>. Al cargar tu próximo Excel desde SIGA, LangGym comparará automáticamente los socios y habilitará el cálculo de altas, bajas, retención y la curva de crecimiento.
            </p>
          </div>
        </div>
      )}

      {/* Top 6 KPI Cards */}
      <section>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <MetricStat
            icon={Users}
            value={analytics.alumnosActuales}
            label="Alumnos actuales"
            sublabel="Base activa"
            tone="bg-accent/12 text-accent"
            index={0}
          />

          <MetricStat
            icon={UserPlus}
            value={analytics.altas}
            prefix="+"
            label="Altas nuevas"
            sublabel="Nuevos socios"
            tone="bg-info/12 text-info"
            index={1}
          />

          <MetricStat
            icon={UserMinus}
            value={analytics.hasSufficientData ? analytics.bajas : "—"}
            label="Bajas detectadas"
            sublabel="No presentes"
            tone="bg-danger/12 text-danger"
            index={2}
            isText={!analytics.hasSufficientData}
          />

          <MetricStat
            icon={TrendingDown}
            value={analytics.tasaBaja != null ? analytics.tasaBaja : "—"}
            suffix={analytics.tasaBaja != null ? "%" : undefined}
            label="Tasa de baja"
            sublabel="Churn"
            tone="bg-danger/12 text-danger"
            index={3}
            isText={analytics.tasaBaja == null}
          />

          <MetricStat
            icon={Activity}
            value={
              analytics.hasSufficientData
                ? analytics.crecimientoNeto >= 0
                  ? `+${analytics.crecimientoNeto}`
                  : `${analytics.crecimientoNeto}`
                : `+${analytics.altas}`
            }
            label="Crecimiento neto"
            sublabel="Altas - Bajas"
            tone={
              analytics.crecimientoNeto >= 0
                ? "bg-accent/12 text-accent"
                : "bg-danger/12 text-danger"
            }
            index={4}
            isText
          />

          <MetricStat
            icon={ShieldCheck}
            value={analytics.tasaRetencion != null ? analytics.tasaRetencion : "—"}
            suffix={analytics.tasaRetencion != null ? "%" : undefined}
            label="Tasa de retención"
            sublabel="Permanencia"
            tone="bg-success/12 text-success"
            index={5}
            isText={analytics.tasaRetencion == null}
          />
        </div>
      </section>

      {/* Tabs navigation for detailed views */}
      <div className="flex items-center gap-2 border-b border-border/80 pb-px">
        <button
          onClick={() => setActiveTab("evolucion")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-[13px] font-medium transition-all ${
            activeTab === "evolucion"
              ? "border-accent text-accent font-semibold"
              : "border-transparent text-muted hover:text-fg"
          }`}
        >
          <TrendingUp size={16} />
          <span>Evolución e Historial de Excel</span>
        </button>

        <button
          onClick={() => setActiveTab("bajas")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-[13px] font-medium transition-all ${
            activeTab === "bajas"
              ? "border-danger text-danger font-semibold"
              : "border-transparent text-muted hover:text-fg"
          }`}
        >
          <UserMinus size={16} />
          <span>Alumnos que dejaron de venir ({analytics.bajasList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("cuotas")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-[13px] font-medium transition-all ${
            activeTab === "cuotas"
              ? "border-accent text-accent font-semibold"
              : "border-transparent text-muted hover:text-fg"
          }`}
        >
          <Layers size={16} />
          <span>Estado de Cuotas y Asistencia</span>
        </button>
      </div>

      {/* Tab 1: Evolución Mensual & Historial */}
      {activeTab === "evolucion" && (
        <div className="space-y-6">
          <MonthlyEvolutionChart data={analytics.evolucion} />
          <HistoricalImportsTable data={analytics.evolucion} />
        </div>
      )}

      {/* Tab 2: Bajas List */}
      {activeTab === "bajas" && (
        <div className="space-y-6">
          <BajasList bajas={analytics.bajasList} />
        </div>
      )}

      {/* Tab 3: Estado de Cuotas & Ausencias */}
      {activeTab === "cuotas" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h3 className="mb-5 text-[14px] font-semibold uppercase tracking-wide text-muted">
              Estado de las cuotas
            </h3>
            <div className="space-y-4">
              {(Object.keys(cuotas) as CuotaEstado[]).map((estado) => (
                <BarRow
                  key={estado}
                  label={CUOTA_META[estado].label}
                  value={cuotas[estado]}
                  total={students.length}
                  color={CUOTA_COLORS[estado]}
                />
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="mb-5 text-[14px] font-semibold uppercase tracking-wide text-muted">
              Ausencias por categoría
            </h3>
            {ausentesTotal === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                No hay alumnos ausentes según tus reglas de riesgo. 🎉
              </p>
            ) : (
              <div className="space-y-4">
                <BarRow label="+7 días" value={m.ausentes7} total={ausentesTotal} color="#FFB020" />
                <BarRow label="+15 días" value={m.ausentes15} total={ausentesTotal} color="#FF8F33" />
                <BarRow label="+30 días" value={m.ausentes30} total={ausentesTotal} color="#FF6B00" />
                <BarRow label="Más de 30 días" value={m.ausentes30plus} total={ausentesTotal} color="#FF4D4D" />
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}