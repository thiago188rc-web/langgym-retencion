"use client";

import { Clock, Hourglass, MessageCircle, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { dayName, type MyEnrollment } from "@/lib/services/enrollmentService";

export function TurnoStatusCard({
  enrollment,
  whatsappLink,
  cancelling,
  onCancelRequest,
}: {
  enrollment: MyEnrollment;
  whatsappLink: string | null;
  cancelling: boolean;
  onCancelRequest: () => void;
}) {
  const isPending = enrollment.status === "pending";
  const dayLabel = dayName(enrollment.dayOfWeek);
  const dayCapitalized = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-faint">Mi turno</h2>

      <div className="relative overflow-hidden rounded-2xl border border-border bg-card/80 p-5 shadow-sm">
        <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: enrollment.classColor }} />

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="flex size-10 items-center justify-center rounded-xl shrink-0"
              style={{ backgroundColor: `${enrollment.classColor}22`, color: enrollment.classColor }}
            >
              {isPending ? <Hourglass size={18} /> : <CheckCircle2 size={18} />}
            </span>
            <div>
              <h3 className="font-bold text-base text-fg tracking-tight">{enrollment.className}</h3>
              <p className="flex items-center gap-1.5 text-xs text-muted mt-0.5">
                <Clock size={13} className="text-faint" />
                {dayCapitalized} a las {enrollment.startTime} hs
              </p>
            </div>
          </div>

          {isPending ? (
            <Badge tone="warning" dot>Pendiente</Badge>
          ) : (
            <Badge tone="success" dot>Confirmado</Badge>
          )}
        </div>

        {isPending ? (
          <p className="mt-4 text-xs text-muted leading-relaxed">
            Tu solicitud está esperando la aprobación del staff. Una vez que confirmen tu pago, vas a poder
            reservar tu lugar todas las semanas en este horario.
          </p>
        ) : (
          <p className="mt-4 text-xs text-muted leading-relaxed">
            Este es tu turno fijo semanal. Tus próximas clases ya están reservadas automáticamente — mirá el
            detalle más abajo. ¿Necesitás otro día u horario? Pedilo por WhatsApp, no podés cambiarlo vos
            mismo desde la app.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
          {isPending ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={onCancelRequest}
              disabled={cancelling}
              className="text-xs text-muted hover:text-danger"
            >
              <X size={13} />
              {cancelling ? "Cancelando…" : "Cancelar solicitud"}
            </Button>
          ) : whatsappLink ? (
            <a href={whatsappLink} target="_blank" rel="noreferrer">
              <Button variant="secondary" size="sm" className="text-xs">
                <MessageCircle size={14} className="text-emerald-400" />
                Solicitar cambio de turno
              </Button>
            </a>
          ) : (
            <p className="text-[11px] text-faint">
              El gimnasio todavía no cargó un WhatsApp de contacto para pedidos de cambio.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
