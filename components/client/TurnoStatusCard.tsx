"use client";

import { Clock, Hourglass, MessageCircle, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { dayName, type MyEnrollment } from "@/lib/services/enrollmentService";

function EnrollmentRow({
  enrollment,
  cancelling,
  onCancelRequest,
}: {
  enrollment: MyEnrollment;
  cancelling: boolean;
  onCancelRequest: (id: string) => void;
}) {
  const isPending = enrollment.status === "pending";
  const dayLabel = dayName(enrollment.dayOfWeek);
  const dayCapitalized = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: enrollment.classColor }} />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="flex size-9 items-center justify-center rounded-xl shrink-0"
            style={{ backgroundColor: `${enrollment.classColor}22`, color: enrollment.classColor }}
          >
            {isPending ? <Hourglass size={16} /> : <CheckCircle2 size={16} />}
          </span>
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-fg tracking-tight truncate">{enrollment.className}</h3>
            <p className="flex items-center gap-1.5 text-xs text-muted mt-0.5">
              <Clock size={12} className="text-faint shrink-0" />
              {dayCapitalized} a las {enrollment.startTime} hs
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isPending ? (
            <Badge tone="warning" dot>Pendiente</Badge>
          ) : (
            <Badge tone="success" dot>Confirmado</Badge>
          )}
          {isPending && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onCancelRequest(enrollment.id)}
              disabled={cancelling}
              className="text-xs text-muted hover:text-danger"
            >
              <X size={13} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function TurnoStatusCard({
  enrollments,
  whatsappLink,
  cancellingId,
  onCancelRequest,
}: {
  enrollments: MyEnrollment[];
  whatsappLink: string | null;
  cancellingId: string | null;
  onCancelRequest: (id: string) => void;
}) {
  const pendingCount = enrollments.filter((e) => e.status === "pending").length;
  const activeCount = enrollments.filter((e) => e.status === "active").length;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-faint">
        Mis horarios semanales {enrollments.length > 1 && `(${enrollments.length})`}
      </h2>

      {pendingCount > 0 && (
        <p className="text-xs text-muted leading-relaxed">
          {pendingCount === 1
            ? "Tenés 1 horario esperando la aprobación del staff."
            : `Tenés ${pendingCount} horarios esperando la aprobación del staff.`}{" "}
          Una vez que confirmen tu pago, vas a tener tu lugar reservado todas las semanas.
        </p>
      )}

      <div className="space-y-2.5">
        {enrollments.map((e) => (
          <EnrollmentRow
            key={e.id}
            enrollment={e}
            cancelling={cancellingId === e.id}
            onCancelRequest={onCancelRequest}
          />
        ))}
      </div>

      {activeCount > 0 && (
        <div className="rounded-2xl border border-border bg-card/40 p-4 space-y-2.5">
          <p className="text-xs text-muted leading-relaxed">
            Estos son tus horarios fijos semanales, ya reservados automáticamente. Es una elección{" "}
            <strong className="text-fg">definitiva</strong>: no podés cambiarlos vos mismo desde la app.
            ¿Necesitás otro día u horario? Pedilo por WhatsApp.
          </p>
          {whatsappLink ? (
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
      )}
    </section>
  );
}
