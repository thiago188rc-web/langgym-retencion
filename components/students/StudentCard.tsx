"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CalendarClock, Clock, Phone } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { CuotaBadge, RiesgoBadge } from "./StatusBadges";
import { WhatsappButton } from "./WhatsappButton";
import { useStore } from "@/lib/store";
import { getSignals } from "@/lib/retention";
import { cobroMessage, recuperacionMessage } from "@/lib/whatsapp";
import { formatDate, relativeDays } from "@/lib/dates";
import type { Student } from "@/lib/types";

export function StudentCard({
  student,
  variant = "recuperacion",
  index = 0,
}: {
  student: Student;
  variant?: "recuperacion" | "cobro";
  index?: number;
}) {
  const config = useStore((s) => s.config);
  const sig = getSignals(student, config);
  const message =
    variant === "cobro" ? cobroMessage(student, config) : recuperacionMessage(student, config);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1], delay: Math.min(index * 0.03, 0.3) }}
      className="group flex flex-col gap-4 rounded-[16px] border border-border bg-card p-4 transition-all duration-200 hover:border-border-strong hover:bg-card-hover"
    >
      <div className="flex items-start gap-3">
        <Avatar nombre={student.nombre} apellido={student.apellido} size={44} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/alumnos/${student.id}`}
            className="block truncate text-[15px] font-semibold text-fg transition-colors hover:text-accent"
          >
            {student.nombreCompleto}
          </Link>
          <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
            <Phone size={12} />
            <span className="truncate tnum">{student.telefonoRaw ?? "Sin teléfono"}</span>
          </div>
        </div>
        {variant === "cobro" ? (
          <CuotaBadge estado={sig.estadoCuota} />
        ) : (
          <RiesgoBadge nivel={sig.riesgo} />
        )}
      </div>

      <div className="flex items-center gap-4 text-[13px] text-muted">
        {variant === "cobro" ? (
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock size={13} className="text-faint" />
            Vence {formatDate(student.fechaFin)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Clock size={13} className="text-faint" />
            {sig.diasSinVenirEsProxy ? "Cuota venció " : "Última visita "}
            {sig.diasSinVenirEsProxy
              ? relativeDays(student.fechaFin)
              : relativeDays(student.ultimaAsistencia)}
          </span>
        )}
        {student.membresia && (
          <span className="truncate text-faint">· {student.membresia}</span>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border/70 pt-3">
        <span className="text-xs text-faint">
          {student.followUps.length > 0
            ? `${student.followUps.length} seguimiento${student.followUps.length > 1 ? "s" : ""}`
            : "Sin contacto aún"}
        </span>
        <WhatsappButton
          student={student}
          message={message}
          tipo={variant === "cobro" ? "cobro" : "recuperacion"}
          size="sm"
        />
      </div>
    </motion.div>
  );
}
