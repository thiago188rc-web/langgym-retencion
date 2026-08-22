"use client";

import { useState } from "react";
import { AlertTriangle, Clock, Lock } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { dayName, type AvailableSchedule } from "@/lib/services/enrollmentService";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function ConfirmEnrollmentModal({
  open,
  schedules,
  submitting,
  onClose,
  onConfirm,
}: {
  open: boolean;
  schedules: AvailableSchedule[];
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  const sorted = [...schedules].sort((a, b) => {
    const da = DAY_ORDER.indexOf(a.dayOfWeek);
    const db = DAY_ORDER.indexOf(b.dayOfWeek);
    if (da !== db) return da - db;
    return a.startTime.localeCompare(b.startTime);
  });

  const handleClose = () => {
    if (submitting) return;
    setAcknowledged(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Anotá tus horarios — por única vez" size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 p-3.5 text-xs text-warning">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Esta elección es por única vez.</strong> Una vez confirmada, estos horarios quedan{" "}
            <strong>fijos para siempre</strong> y no vas a poder cambiarlos vos mismo desde la app. Si más
            adelante necesitás otro día u horario, vas a tener que pedirlo por WhatsApp al staff.
          </p>
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-semibold text-fg uppercase tracking-wider">
            Vas a anotarte a estos {schedules.length === 1 ? "horario" : "horarios"}:
          </span>
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {sorted.map((s) => (
              <div
                key={s.scheduleId}
                className="flex items-center gap-2.5 rounded-xl border border-border bg-surface/70 px-3 py-2"
              >
                <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: s.classColor }} />
                <span className="text-xs font-semibold text-fg flex-1 truncate">{s.className}</span>
                <span className="flex items-center gap-1 text-[11px] text-muted shrink-0">
                  <Clock size={11} />
                  {dayName(s.dayOfWeek)} {s.startTime}hs
                </span>
              </div>
            ))}
          </div>
        </div>

        <label className="flex items-start gap-2.5 rounded-xl border border-border bg-card/60 p-3 text-xs text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-accent"
          />
          <span>
            Entiendo que esta elección es <strong className="text-fg">definitiva</strong> y que no voy a poder
            cambiarla por mi cuenta.
          </span>
        </label>

        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            disabled={submitting}
            onClick={handleClose}
            className="rounded-xl border border-border px-3.5 py-1.5 text-xs font-semibold text-muted hover:text-fg"
          >
            Volver
          </button>
          <button
            type="button"
            disabled={!acknowledged || submitting || schedules.length === 0}
            onClick={onConfirm}
            className="flex items-center gap-1.5 rounded-xl bg-accent-gradient px-4 py-1.5 text-xs font-semibold text-white shadow-xs disabled:opacity-50"
          >
            <Lock size={12} />
            {submitting ? "Confirmando…" : "Confirmar por única vez"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
