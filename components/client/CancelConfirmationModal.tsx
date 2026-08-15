"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { AlertCircle, Calendar, Clock } from "lucide-react";
import { formatDateFullES, formatClassTime } from "@/lib/dates";
import type { UserReservationItem } from "@/lib/services/bookingService";

export function CancelConfirmationModal({
  reservation,
  open,
  loading,
  onClose,
  onConfirm,
}: {
  reservation: UserReservationItem | null;
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!reservation) return null;

  return (
    <Modal open={open} onClose={onClose} title="Cancelar reserva" maxWidth={440}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning/10 p-3.5 text-[13px] text-warning">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <p>
            Al cancelar, liberarás tu lugar para que otro alumno pueda reservar.
          </p>
        </div>

        {/* Reservation details */}
        <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <span
              className="size-3 rounded-full shrink-0"
              style={{ backgroundColor: reservation.classColor }}
            />
            <span className="font-bold text-fg text-base">{reservation.className}</span>
          </div>

          <div className="flex flex-col gap-1.5 text-xs text-muted">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-faint" />
              <span>{formatDateFullES(reservation.classDate)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-faint" />
              <span>{formatClassTime(reservation.startTime)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Volver
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={loading}
            className="gap-2"
          >
            {loading ? "Cancelando…" : "Confirmar cancelación"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
