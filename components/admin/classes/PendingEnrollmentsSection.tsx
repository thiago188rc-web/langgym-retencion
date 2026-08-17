"use client";

import { useState } from "react";
import {
  ClipboardList,
  Check,
  X,
  Phone,
  MessageCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PendingEnrollmentRequest } from "@/lib/services/adminEnrollmentService";

const DAYS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return "hace instantes";
  if (diffH < 24) return `hace ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `hace ${diffD}d`;
}

export function PendingEnrollmentsSection({
  requests,
  loading,
  onApprove,
  onReject,
}: {
  requests: PendingEnrollmentRequest[];
  loading: boolean;
  onApprove: (enrollmentId: string) => Promise<void>;
  onReject: (enrollmentId: string) => Promise<void>;
}) {
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      await onApprove(id);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessingId(id);
    try {
      await onReject(id);
    } finally {
      setProcessingId(null);
    }
  };

  if (!loading && requests.length === 0) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-accent/25 bg-accent/[0.04] p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-xl bg-accent-gradient text-white shrink-0">
          <ClipboardList size={16} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-fg">Solicitudes de turno pendientes</h3>
          <p className="text-[11px] text-muted">
            Revisá el pago del alumno antes de aceptar. Al aceptar, el turno queda confirmado para las próximas semanas.
          </p>
        </div>
        {requests.length > 0 && (
          <span className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
            {requests.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-card/40" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {requests.map((req) => {
            const isProcessing = processingId === req.enrollmentId;
            return (
              <div
                key={req.enrollmentId}
                className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-fg truncate">{req.displayName}</span>
                      {req.idSocio && (
                        <span className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px] font-mono text-faint shrink-0">
                          #{req.idSocio}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
                      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: req.classColor }} />
                      <span className="font-medium text-fg">{req.className}</span>
                      <span>·</span>
                      <span>{DAYS_ES[req.dayOfWeek]} {req.startTime}hs</span>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-[10px] text-faint shrink-0">
                    <Clock size={10} />
                    {timeAgo(req.requestedAt)}
                  </span>
                </div>

                {/* Payment / membership context */}
                <div className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-bg/50 px-2.5 py-1.5 text-[11px]">
                  {!req.studentLinked ? (
                    <span className="flex items-center gap-1.5 text-warning">
                      <AlertTriangle size={12} /> Sin ficha de socio vinculada — verificá el pago manualmente
                    </span>
                  ) : req.membershipActive === false ? (
                    <span className="flex items-center gap-1.5 text-danger">
                      <AlertTriangle size={12} /> Cuota vencida o socio inhabilitado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-success">
                      <CheckCircle2 size={12} /> Socio habilitado, cuota al día
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {req.phone && (
                    <a
                      href={`https://wa.me/${req.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-emerald-400 hover:bg-emerald-500/10"
                      title="Contactar por WhatsApp"
                    >
                      <MessageCircle size={12} />
                      <Phone size={11} />
                      {req.phone}
                    </a>
                  )}

                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleReject(req.enrollmentId)}
                      className={cn(
                        "flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-muted transition-all active:scale-95",
                        "hover:border-danger/40 hover:bg-danger/10 hover:text-danger",
                      )}
                    >
                      <X size={12} /> Rechazar
                    </button>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleApprove(req.enrollmentId)}
                      className="flex items-center gap-1 rounded-lg bg-accent-gradient px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-xs transition-all active:scale-95 disabled:opacity-60"
                    >
                      <Check size={12} /> {isProcessing ? "Procesando…" : "Aceptar turno"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
