"use client";

import { useMemo } from "react";
import { Clock, Users, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { dayName, type AvailableSchedule } from "@/lib/services/enrollmentService";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday-first display order

export function TurnoRequestList({
  schedules,
  loading,
  requestingScheduleId,
  onRequestClick,
}: {
  schedules: AvailableSchedule[];
  loading: boolean;
  requestingScheduleId: string | null;
  onRequestClick: (schedule: AvailableSchedule) => void;
}) {
  const groupedByDay = useMemo(() => {
    const map = new Map<number, AvailableSchedule[]>();
    for (const s of schedules) {
      const list = map.get(s.dayOfWeek) || [];
      list.push(s);
      map.set(s.dayOfWeek, list);
    }
    return DAY_ORDER.map((day) => ({ day, items: map.get(day) || [] })).filter((g) => g.items.length > 0);
  }, [schedules]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold tracking-tight text-fg">Elegí tu turno semanal</h2>
        <p className="text-xs text-muted">
          Vas a tener este horario fijo todas las semanas una vez que el staff confirme tu pago.
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card/40 p-8 flex flex-col items-center justify-center gap-3">
          <Loader2 size={24} className="animate-spin text-accent" />
          <span className="text-xs text-muted">Consultando horarios disponibles…</span>
        </div>
      ) : schedules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/30 p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-fg">No hay horarios disponibles todavía</p>
          <p className="text-xs text-muted max-w-sm mx-auto">
            El gimnasio todavía no cargó actividades. Consultá directamente con el staff.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groupedByDay.map(({ day, items }) => (
            <div key={day} className="space-y-2.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                {dayName(day)}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {items.map((sch) => {
                  const isRequesting = requestingScheduleId === sch.scheduleId;
                  return (
                    <div
                      key={sch.scheduleId}
                      className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card/90 p-4 shadow-sm backdrop-blur-md transition-all hover:border-border-strong"
                    >
                      <div className="absolute top-0 left-0 bottom-0 w-1.5" style={{ backgroundColor: sch.classColor }} />

                      <div className="space-y-2 pl-1.5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-bold text-fg tracking-tight">{sch.className}</h4>
                            {sch.classDescription && (
                              <p className="text-[11px] text-faint line-clamp-1 mt-0.5">{sch.classDescription}</p>
                            )}
                          </div>

                          {sch.isPendingCapacity ? (
                            <Badge tone="info">A confirmar</Badge>
                          ) : sch.isFull ? (
                            <Badge tone="neutral">Sin cupos</Badge>
                          ) : (
                            <Badge tone="accent">{sch.availableSpots} libres</Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted">
                          <span className="flex items-center gap-1.5 font-semibold text-fg">
                            <Clock size={13} className="text-accent shrink-0" />
                            {sch.startTime} hs
                          </span>
                          {!sch.isPendingCapacity && (
                            <span className="flex items-center gap-1.5">
                              <Users size={13} className="text-faint shrink-0" />
                              {sch.activeEnrollments} / {sch.capacity}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="pt-3 mt-3 border-t border-border/50 pl-1.5">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => onRequestClick(sch)}
                          disabled={isRequesting || Boolean(requestingScheduleId)}
                          className="w-full justify-center text-xs gap-2"
                        >
                          {isRequesting ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              Enviando…
                            </>
                          ) : (
                            <>
                              <Sparkles size={14} />
                              Solicitar este turno
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
