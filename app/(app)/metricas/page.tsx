"use client";

import { useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  CircleAlert,
  MessageSquare,
  Trophy,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { computeMetrics, getSignals } from "@/lib/retention";
import { Card } from "@/components/ui/Card";
import { CountUp } from "@/components/ui/CountUp";
import { NoData } from "@/components/NoData";
import { CUOTA_META } from "@/components/students/StatusBadges";
import type { CuotaEstado } from "@/lib/types";

function MetricStat({
  icon: Icon,
  value,
  suffix,
  label,
  tone,
  index,
}: {
  icon: typeof TrendingUp;
  value: number;
  suffix?: string;
  label: string;
  tone: string;
  index: number;
}) {
  return (
    <Card className="p-5 animate-rise" style={{ animationDelay: `${index * 50}ms` }}>
      <div className={`mb-4 flex size-10 items-center justify-center rounded-xl ${tone}`}>
        <Icon size={19} />
      </div>
      <div className="text-[30px] font-semibold leading-none tracking-tight">
        <CountUp value={value} suffix={suffix} />
      </div>
      <div className="mt-2 text-[13px] text-muted">{label}</div>
    </Card>
  );
}

function BarRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
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

export default function MetricasPage() {
  const students = useStore((s) => s.students);
  const config = useStore((s) => s.config);

  const data = useMemo(() => {
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

  if (students.length === 0) return <NoData />;

  const { m, cuotas, recuperaciones } = data;
  const ausentesTotal = m.ausentes7 + m.ausentes15 + m.ausentes30 + m.ausentes30plus;

  return (
    <div className="space-y-8">
      <section>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <MetricStat icon={TrendingUp} value={m.recuperadosMes} label="Recuperados este mes" tone="bg-success/12 text-success" index={0} />
          <MetricStat icon={TrendingDown} value={m.perdidos} label="Alumnos perdidos" tone="bg-danger/12 text-danger" index={1} />
          <MetricStat icon={Activity} value={m.porcentajeAsistencia} suffix="%" label="Porcentaje de asistencia" tone="bg-accent/12 text-accent" index={2} />
          <MetricStat icon={CircleAlert} value={m.enRiesgo} label="Alumnos en riesgo" tone="bg-warning/12 text-warning" index={3} />
          <MetricStat icon={MessageSquare} value={m.contactosMes} label="Contactos realizados (mes)" tone="bg-info/12 text-info" index={4} />
          <MetricStat icon={Trophy} value={recuperaciones} label="Recuperaciones logradas" tone="bg-accent/12 text-accent" index={5} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="mb-5 text-[13px] font-semibold uppercase tracking-wide text-muted">
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
          <h3 className="mb-5 text-[13px] font-semibold uppercase tracking-wide text-muted">
            Ausencias por categoría
          </h3>
          {ausentesTotal === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              No hay alumnos ausentes según tus reglas. 🎉
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
    </div>
  );
}