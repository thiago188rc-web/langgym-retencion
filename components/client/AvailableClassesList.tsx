"use client";

import { Clock, Users, Check, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDateFullES, formatClassTime } from "@/lib/dates";
import type { AvailableClass } from "@/lib/services/bookingService";

export function AvailableClassesList({
  selectedDate,
  classes,
  loading,
  bookingScheduleId,
  onBookClick,
  onCancelReservedClick,
}: {
  selectedDate: string;
  classes: AvailableClass[];
  loading: boolean;
  bookingScheduleId: string | null;
  onBookClick: (classItem: AvailableClass) => void;
  onCancelReservedClick: (classItem: AvailableClass) => void;
}) {
  const formattedDate = formatDateFullES(selectedDate);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold tracking-tight text-fg">
          ¿Qué clase querés reservar?
        </h2>
        <p className="text-xs text-muted flex items-center gap-1.5">
          <Clock size={13} className="text-accent" />
          <span>Horarios para {formattedDate}</span>
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card/40 p-8 flex flex-col items-center justify-center gap-3">
          <Loader2 size={24} className="animate-spin text-accent" />
          <span className="text-xs text-muted">Consultando disponibilidad en tiempo real…</span>
        </div>
      ) : classes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/30 p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-fg">
            No hay actividades programadas para este día
          </p>
          <p className="text-xs text-muted max-w-sm mx-auto">
            Seleccioná otra fecha en el calendario superior para ver las clases de la semana.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {classes.map((cls) => {
            const isBookingThis = bookingScheduleId === cls.scheduleId;

            return (
              <div
                key={cls.scheduleId}
                className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card/90 p-5 shadow-sm backdrop-blur-md transition-all hover:border-border-strong"
              >
                {/* Accent indicator border */}
                <div
                  className="absolute top-0 left-0 bottom-0 w-1.5"
                  style={{ backgroundColor: cls.classColor }}
                />

                <div className="space-y-3 pl-1.5">
                  {/* Top line: Name & Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-fg tracking-tight">
                        {cls.className}
                      </h3>
                      {cls.classDescription && (
                        <p className="text-xs text-faint line-clamp-1 mt-0.5">
                          {cls.classDescription}
                        </p>
                      )}
                    </div>

                    {cls.isUserReserved ? (
                      <Badge tone="success" dot>
                        Inscripto
                      </Badge>
                    ) : cls.isPendingCapacity ? (
                      <Badge tone="info">A confirmar</Badge>
                    ) : cls.isFull ? (
                      <Badge tone="neutral">Sin cupos</Badge>
                    ) : cls.availableSpots === 1 ? (
                      <Badge tone="warning" dot>
                        ¡Último lugar!
                      </Badge>
                    ) : (
                      <Badge tone="accent">
                        {cls.availableSpots} libres
                      </Badge>
                    )}
                  </div>

                  {/* Class Info */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted pt-1">
                    <div className="flex items-center gap-1.5 font-semibold text-fg">
                      <Clock size={14} className="text-accent shrink-0" />
                      <span>{formatClassTime(cls.startTime)}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-muted justify-end">
                      <Users size={14} className="text-faint shrink-0" />
                      {cls.isPendingCapacity ? (
                        <span>Cupo pendiente</span>
                      ) : (
                        <span>
                          {cls.confirmedReservations} / {cls.capacity} lugares
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Action Area */}
                <div className="pt-4 mt-3 border-t border-border/50 pl-1.5">
                  {cls.isUserReserved ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                        <Check size={14} /> Ya estás inscripto
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onCancelReservedClick(cls)}
                        className="text-xs text-muted hover:text-danger"
                      >
                        Cancelar
                      </Button>
                    </div>
                  ) : cls.isPendingCapacity ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled
                      className="w-full justify-center text-xs opacity-60"
                    >
                      No disponible todavía
                    </Button>
                  ) : cls.isFull ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled
                      className="w-full justify-center text-xs opacity-60"
                    >
                      Sin cupos disponibles
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onBookClick(cls)}
                      disabled={isBookingThis || Boolean(bookingScheduleId)}
                      className="w-full justify-center text-xs gap-2 py-2.5"
                    >
                      {isBookingThis ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Reservando…
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} />
                          Reservar lugar
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
