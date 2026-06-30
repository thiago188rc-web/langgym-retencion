"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import { RiesgoBadge } from "@/components/students/StatusBadges";
import { WhatsappButton } from "@/components/students/WhatsappButton";
import { useStore } from "@/lib/store";
import { cobroMessage, recuperacionMessage } from "@/lib/whatsapp";
import { relativeDays } from "@/lib/dates";
import type { StudentWithSignals } from "@/lib/selectors";

export function PriorityRow({ item, index }: { item: StudentWithSignals; index: number }) {
  const config = useStore((s) => s.config);
  const { student, signals } = item;
  const esCobro = signals.estadoCuota === "vencida" || signals.diasParaVencer === 0;
  const message = esCobro ? cobroMessage(student, config) : recuperacionMessage(student, config);

  const motivo = esCobro
    ? signals.diasParaVencer === 0
      ? "Vence hoy"
      : "Cuota vencida"
    : signals.diasSinVenirEsProxy
      ? `Cuota venció ${relativeDays(student.fechaFin)}`
      : `Sin venir ${relativeDays(student.ultimaAsistencia)}`;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.4) }}
      className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition-colors hover:bg-white/[0.025]"
    >
      <Avatar nombre={student.nombre} apellido={student.apellido} size={38} />
      <div className="min-w-0 flex-1">
        <Link
          href={`/alumnos/${student.id}`}
          className="block truncate text-sm font-medium text-fg transition-colors hover:text-accent"
        >
          {student.nombreCompleto}
        </Link>
        <span className="text-[12px] text-muted">{motivo}</span>
      </div>
      <div className="hidden sm:block">
        <RiesgoBadge nivel={signals.riesgo} />
      </div>
      <WhatsappButton
        student={student}
        message={message}
        tipo={esCobro ? "cobro" : "recuperacion"}
        size="sm"
        label=""
      />
    </motion.div>
  );
}