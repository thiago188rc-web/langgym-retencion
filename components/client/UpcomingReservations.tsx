"use client";

import { Calendar, Clock, AlertCircle, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDateFullES, formatClassTime } from "@/lib/dates";
import type { UserReservationItem } from "@/lib/services/bookingService";

export function UpcomingReservations({
  reservations,
  loading,
  onCancelClick,
  onExploreClick,
}: {
  reservations: UserReservationItem[];
  loading: boolean;
  onCancelClick: (res: UserReservationItem) => void;
  onExploreClick: () => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-faint">
          Mis próximas clases
        </h2>
        {reservations.length > 0 && (
          <span className="text-xs text-muted">
            {reservations.length} {reservations.length === 1 ? "reserva" : "reservas"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card/40 p-6 flex justify-center items-center">
          <div className="flex items-center gap-2 text-xs text-muted animate-pulse">
            <Calendar size={15} />
            <span>Cargando tus clases...</span>
          </div>
        </div>
      ) : reservations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/30 p-6 text-center space-y-3">
          <p className="text-sm text-muted">
            Todavía no tenés clases reservadas.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={onExploreClick}
            className="text-xs"
          >
            Reservar una clase
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {reservations.map((res) => (
            <div
              key={res.id}
              className="relative overflow-hidden rounded-2xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur-sm transition-all hover:border-border-strong flex flex-col justify-between gap-3"
            >
              {/* Colored top bar */}
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{ backgroundColor: res.classColor }}
              />

              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: res.classColor }}
                    />
                    <h3 className="font-bold text-base text-fg tracking-tight">
                      {res.className}
                    </h3>
                  </div>
                  <Badge tone="success" dot>
                    RESERVADO
                  </Badge>
                </div>

                <div className="space-y-1 text-xs text-muted">
                  <div className="flex items-center gap-1.5 font-medium text-fg/90">
                    <Calendar size={13} className="text-faint" />
                    <span>{formatDateFullES(res.classDate)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock size={13} className="text-faint" />
                    <span>{formatClassTime(res.startTime)}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-border/60 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => onCancelClick(res)}
                  className="text-xs font-medium text-muted hover:text-danger flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-danger/10 transition-colors"
                >
                  <X size={13} />
                  Cancelar reserva
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
