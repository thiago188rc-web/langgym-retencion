"use client";

import { useMemo } from "react";
import { Wallet } from "lucide-react";
import { useStore } from "@/lib/store";
import { getCobros, type StudentWithSignals } from "@/lib/selectors";
import { StudentCard } from "@/components/students/StudentCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { NoData } from "@/components/NoData";
import { cn } from "@/lib/utils";

function CobroSection({
  title,
  subtitle,
  items,
  tone,
}: {
  title: string;
  subtitle: string;
  items: StudentWithSignals[];
  tone: "warning" | "info" | "danger";
}) {
  const dotColor = {
    warning: "bg-warning",
    info: "bg-info",
    danger: "bg-danger",
  }[tone];

  if (items.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center gap-2.5">
        <span className={cn("size-2 rounded-full", dotColor)} />
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        <span className="tnum rounded-full bg-white/[0.06] px-2 py-0.5 text-[12px] font-semibold text-muted">
          {items.length}
        </span>
        <span className="text-[13px] text-faint">· {subtitle}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item, i) => (
          <StudentCard key={item.student.id} student={item.student} variant="cobro" index={i} />
        ))}
      </div>
    </section>
  );
}

export default function CobrosPage() {
  const students = useStore((s) => s.students);
  const config = useStore((s) => s.config);
  const cobros = useMemo(() => getCobros(students, config), [students, config]);

  if (students.length === 0) return <NoData />;

  const totalAcciones = cobros.hoy.length + cobros.semana.length + cobros.vencidas.length;

  return (
    <div className="space-y-8">
      {totalAcciones === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Sin cuotas pendientes"
          description="No hay cuotas que venzan hoy, esta semana ni vencidas. Buen trabajo."
        />
      ) : (
        <>
          <CobroSection title="Vencen hoy" subtitle="Recordá antes de que se venza" items={cobros.hoy} tone="warning" />
          <CobroSection title="Vencen esta semana" subtitle="Próximos 7 días" items={cobros.semana} tone="info" />
          <CobroSection title="Cuotas vencidas" subtitle="Pendientes de renovación" items={cobros.vencidas} tone="danger" />
        </>
      )}
    </div>
  );
}