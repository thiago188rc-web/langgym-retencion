"use client";

import { useState } from "react";
import { Users2, Phone, MessageCircle, UserX, Check, X } from "lucide-react";
import type { ActiveEnrollment } from "@/lib/services/adminEnrollmentService";

const DAYS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function ActiveEnrollmentsSection({
  enrollments,
  loading,
  onCancel,
}: {
  enrollments: ActiveEnrollment[];
  loading: boolean;
  onCancel: (enrollmentId: string) => Promise<void>;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleConfirmCancel = async (id: string) => {
    setProcessingId(id);
    try {
      await onCancel(id);
    } finally {
      setProcessingId(null);
      setConfirmingId(null);
    }
  };

  if (!loading && enrollments.length === 0) return null;

  return (
    <details className="group rounded-2xl border border-border bg-surface/60">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 p-4 select-none">
        <span className="flex size-8 items-center justify-center rounded-xl bg-card text-muted shrink-0">
          <Users2 size={16} />
        </span>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-fg">Turnos fijos activos</h3>
          <p className="text-[11px] text-muted">
            Alumnos con turno semanal confirmado. Liberá uno si el alumno pidió cambiarse por WhatsApp.
          </p>
        </div>
        <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-semibold text-muted">
          {enrollments.length}
        </span>
      </summary>

      <div className="border-t border-border p-4 pt-3 space-y-2">
        {loading ? (
          <div className="h-16 animate-pulse rounded-xl border border-border bg-card/40" />
        ) : (
          enrollments.map((e) => {
            const isConfirming = confirmingId === e.enrollmentId;
            const isProcessing = processingId === e.enrollmentId;
            return (
              <div
                key={e.enrollmentId}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-border bg-card/60 p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: e.classColor }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-fg truncate">{e.displayName}</span>
                      {e.idSocio && (
                        <span className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px] font-mono text-faint">
                          #{e.idSocio}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted">
                      {e.className} · {DAYS_ES[e.dayOfWeek]} {e.startTime}hs
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  {e.phone && (
                    <a
                      href={`https://wa.me/${e.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-emerald-400 hover:bg-emerald-500/10"
                    >
                      <MessageCircle size={12} />
                      <Phone size={11} />
                    </a>
                  )}

                  {isConfirming ? (
                    <>
                      <span className="text-[11px] text-muted">¿Liberar turno?</span>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleConfirmCancel(e.enrollmentId)}
                        className="flex items-center gap-1 rounded-lg bg-danger px-2 py-1 text-[11px] font-semibold text-white hover:bg-danger/90"
                      >
                        <Check size={11} /> Sí
                      </button>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => setConfirmingId(null)}
                        className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted hover:text-fg"
                      >
                        <X size={11} /> No
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(e.enrollmentId)}
                      className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-muted hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
                    >
                      <UserX size={12} /> Liberar turno
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </details>
  );
}
