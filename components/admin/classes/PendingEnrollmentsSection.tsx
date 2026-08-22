"use client";

import { useMemo, useState } from "react";
import {
  ClipboardList,
  Check,
  CheckCheck,
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
  onApproveAll,
}: {
  requests: PendingEnrollmentRequest[];
  loading: boolean;
  onApprove: (enrollmentId: string) => Promise<void>;
  onReject: (enrollmentId: string) => Promise<void>;
  onApproveAll: (enrollmentIds: string[]) => Promise<void>;
}) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingGroupUserId, setProcessingGroupUserId] = useState<string | null>(null);

  // Group by student: an alumno can now request several days at once.
  const groups = useMemo(() => {
    const map = new Map<string, PendingEnrollmentRequest[]>();
    for (const req of requests) {
      const list = map.get(req.userId) || [];
      list.push(req);
      map.set(req.userId, list);
    }
    return Array.from(map.values());
  }, [requests]);

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

  const handleApproveAll = async (userId: string, ids: string[]) => {
    setProcessingGroupUserId(userId);
    try {
      await onApproveAll(ids);
    } finally {
      setProcessingGroupUserId(null);
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
        <div className="space-y-3">
          {groups.map((group) => {
            const first = group[0];
            const isGroupProcessing = processingGroupUserId === first.userId;
            return (
              <div key={first.userId} className="rounded-xl border border-border bg-card p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-fg truncate">{first.displayName}</span>
                      {first.idSocio && (
                        <span className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px] font-mono text-faint shrink-0">
                          #{first.idSocio}
                        </span>
                      )}
                      <span className="text-[11px] text-muted">
                        pidió {group.length === 1 ? "1 horario" : `${group.length} horarios`}
                      </span>
                    </div>

                    {/* Payment / membership context (same for all requests of this student) */}
                    <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-border/70 bg-bg/50 px-2.5 py-1 text-[11px] w-fit">
                      {!first.studentLinked ? (
                        <span className="flex items-center gap-1.5 text-warning">
                          <AlertTriangle size={12} /> Sin ficha de socio vinculada — verificá el pago manualmente
                        </span>
                      ) : first.membershipActive === false ? (
                        <span className="flex items-center gap-1.5 text-danger">
                          <AlertTriangle size={12} /> Cuota vencida o socio inhabilitado
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-success">
                          <CheckCircle2 size={12} /> Socio habilitado, cuota al día
                        </span>
                      )}
                    </div>
                  </div>

                  {first.phone && (
                    <a
                      href={`https://wa.me/${first.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-emerald-400 hover:bg-emerald-500/10 shrink-0"
                      title="Contactar por WhatsApp"
                    >
                      <MessageCircle size={12} />
                      <Phone size={11} />
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {group.map((req) => {
                    const isProcessing = processingId === req.enrollmentId;
                    return (
                      <div
                        key={req.enrollmentId}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-surface/60 px-2.5 py-2"
                      >
                        <div className="flex items-center gap-1.5 min-w-0 text-[12px]">
                          <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: req.classColor }} />
                          <span className="font-medium text-fg truncate">{req.className}</span>
                          <span className="text-muted shrink-0">
                            · {DAYS_ES[req.dayOfWeek]} {req.startTime}hs
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-faint shrink-0 ml-1">
                            <Clock size={10} />
                            {timeAgo(req.requestedAt)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={isProcessing || isGroupProcessing}
                            onClick={() => handleReject(req.enrollmentId)}
                            className={cn(
                              "flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-[11px] font-semibold text-muted transition-all active:scale-95",
                              "hover:border-danger/40 hover:bg-danger/10 hover:text-danger",
                            )}
                          >
                            <X size={11} />
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing || isGroupProcessing}
                            onClick={() => handleApprove(req.enrollmentId)}
                            className="flex items-center gap-1 rounded-lg bg-accent-gradient px-2 py-1 text-[11px] font-semibold text-white shadow-xs transition-all active:scale-95 disabled:opacity-60"
                          >
                            <Check size={11} /> {isProcessing ? "…" : "Aceptar"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {group.length > 1 && (
                  <button
                    type="button"
                    disabled={isGroupProcessing}
                    onClick={() => handleApproveAll(first.userId, group.map((g) => g.enrollmentId))}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-[11px] font-semibold text-accent transition-all active:scale-95 disabled:opacity-60"
                  >
                    <CheckCheck size={13} />
                    {isGroupProcessing ? "Aceptando todos…" : `Aceptar los ${group.length} horarios`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
