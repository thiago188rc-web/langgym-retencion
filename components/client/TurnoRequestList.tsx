"use client";

import { useMemo, useState } from "react";
import { Clock, Users, Loader2, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { dayName, type AvailableSchedule } from "@/lib/services/enrollmentService";
import { ConfirmEnrollmentModal } from "@/components/client/ConfirmEnrollmentModal";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday-first display order

export function TurnoRequestList({
  schedules,
  loading,
  submitting,
  onConfirm,
}: {
  schedules: AvailableSchedule[];
  loading: boolean;
  submitting: boolean;
  onConfirm: (scheduleIds: string[]) => Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const groupedByDay = useMemo(() => {
    const map = new Map<number, AvailableSchedule[]>();
    for (const s of schedules) {
      const list = map.get(s.dayOfWeek) || [];
      list.push(s);
      map.set(s.dayOfWeek, list);
    }
    return DAY_ORDER.map((day) => ({ day, items: map.get(day) || [] })).filter((g) => g.items.length > 0);
  }, [schedules]);

  const selectedSchedules = useMemo(
    () => schedules.filter((s) => selectedIds.includes(s.scheduleId)),
    [schedules, selectedIds],
  );

  const toggleSelection = (schedule: AvailableSchedule) => {
    if (schedule.isFull) return;
    setSelectedIds((prev) =>
      prev.includes(schedule.scheduleId)
        ? prev.filter((id) => id !== schedule.scheduleId)
        : [...prev, schedule.scheduleId],
    );
  };

  const handleFinalConfirm = async () => {
    await onConfirm(selectedIds);
    setConfirmModalOpen(false);
    setSelectedIds([]);
  };

  return (
    <section className="space-y-4 pb-20">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold tracking-tight text-fg">Elegí tus horarios semanales</h2>
        <p className="text-xs text-muted">
          Todas las actividades son libres de lunes a sábado: elegí tantos días como quieras (uno, tres, seis...).
          Vas a tener estos horarios fijos todas las semanas una vez que el staff confirme tu pago.
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
                  const isSelected = selectedIds.includes(sch.scheduleId);
                  return (
                    <button
                      type="button"
                      key={sch.scheduleId}
                      onClick={() => toggleSelection(sch)}
                      disabled={sch.isFull}
                      className={`relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 shadow-sm backdrop-blur-md text-left transition-all ${
                        sch.isFull
                          ? "border-border bg-card/40 opacity-60 cursor-not-allowed"
                          : isSelected
                            ? "border-accent bg-accent/10 ring-1 ring-accent"
                            : "border-border bg-card/90 hover:border-border-strong"
                      }`}
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

                          <span
                            className={`flex size-6 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                              isSelected ? "border-accent bg-accent text-white" : "border-border bg-bg/60 text-transparent"
                            }`}
                          >
                            <CheckCircle2 size={14} />
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted">
                          <span className="flex items-center gap-1.5 font-semibold text-fg">
                            <Clock size={13} className="text-accent shrink-0" />
                            {sch.startTime} hs
                          </span>
                          {sch.isPendingCapacity ? (
                            <Badge tone="info">A confirmar</Badge>
                          ) : sch.isFull ? (
                            <Badge tone="neutral">Sin cupos</Badge>
                          ) : (
                            <span className="flex items-center gap-1.5">
                              <Users size={13} className="text-faint shrink-0" />
                              {sch.activeEnrollments} / {sch.capacity}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sticky confirm bar */}
      {selectedIds.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 backdrop-blur-md px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <span className="text-xs font-semibold text-fg">
              {selectedIds.length} {selectedIds.length === 1 ? "horario seleccionado" : "horarios seleccionados"}
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setConfirmModalOpen(true)}
              disabled={submitting}
              className="text-xs"
            >
              Confirmar mis horarios
            </Button>
          </div>
        </div>
      )}

      <ConfirmEnrollmentModal
        open={confirmModalOpen}
        schedules={selectedSchedules}
        submitting={submitting}
        onClose={() => setConfirmModalOpen(false)}
        onConfirm={handleFinalConfirm}
      />
    </section>
  );
}
