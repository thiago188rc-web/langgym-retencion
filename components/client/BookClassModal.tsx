"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Calendar, Clock, Users, Check, AlertCircle, Sparkles, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  getAvailableClassesForDate,
  bookClass,
  type AvailableClass,
} from "@/lib/services/bookingService";
import {
  getArgentinaTodayISO,
  shiftDateDays,
  formatDayAndDate,
  formatClassTime,
  getDayOfWeekFromISO,
} from "@/lib/dates";
import { cn } from "@/lib/utils";

const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function BookClassModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const todayISO = useMemo(() => getArgentinaTodayISO(), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayISO);
  const [classes, setClasses] = useState<AvailableClass[]>([]);
  const [loading, setLoading] = useState(false);
  const [bookingScheduleId, setBookingScheduleId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Generate next 7 days for the date selector pills
  const nextDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const iso = shiftDateDays(todayISO, i);
      const dow = getDayOfWeekFromISO(iso);
      const [, m, d] = iso.split("-");
      return {
        iso,
        label: i === 0 ? "Hoy" : i === 1 ? "Mañana" : `${DAYS_ES[dow]} ${d}/${m}`,
        dayName: DAYS_ES[dow],
        dateStr: `${d}/${m}`,
      };
    });
  }, [todayISO]);

  const fetchClasses = useCallback(async (date: string) => {
    setLoading(true);
    setErrorMessage(null);
    const res = await getAvailableClassesForDate(date);
    if (res.error) {
      setErrorMessage(res.error);
      setClasses([]);
    } else {
      setClasses(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      setSuccessMessage(null);
      setErrorMessage(null);
      fetchClasses(selectedDate);
    }
  }, [open, selectedDate, fetchClasses]);

  const handleBook = async (schedule: AvailableClass) => {
    if (schedule.isFull || schedule.isUserReserved) return;
    setBookingScheduleId(schedule.scheduleId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await bookClass(schedule.scheduleId, selectedDate);
      if (res.success) {
        setSuccessMessage(`¡Lugar reservado con éxito en ${res.className || schedule.className}!`);
        await onSuccess();
        // Refresh classes list to update spots and reservation state
        await fetchClasses(selectedDate);
      } else {
        setErrorMessage(res.error || "No se pudo completar la reserva.");
      }
    } catch {
      setErrorMessage("Error de conexión al reservar. Por favor intentá nuevamente.");
    } finally {
      setBookingScheduleId(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Reservar una clase" size="lg">
      <div className="space-y-5">
        <p className="text-xs text-muted">
          Elegí la fecha y consultá los lugares disponibles en tiempo real para reservar tu lugar.
        </p>

        {/* Date Selector Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {nextDays.map((d) => {
            const isSelected = d.iso === selectedDate;
            return (
              <button
                key={d.iso}
                type="button"
                onClick={() => setSelectedDate(d.iso)}
                className={cn(
                  "flex flex-col items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold shrink-0 transition-all cursor-pointer min-w-[72px]",
                  isSelected
                    ? "border-accent bg-accent/15 text-accent shadow-xs"
                    : "border-border bg-card/60 text-muted hover:border-border-strong hover:text-fg",
                )}
              >
                <span className="text-[10px] uppercase font-bold tracking-wider">{d.dayName}</span>
                <span className="text-sm font-bold text-fg mt-0.5">{d.dateStr}</span>
              </button>
            );
          })}
        </div>

        {/* Feedback alerts */}
        {successMessage && (
          <div className="flex items-center gap-2.5 rounded-xl border border-success/30 bg-success/10 p-3 text-xs text-success">
            <Check size={16} className="shrink-0" />
            <span className="font-semibold">{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-center gap-2.5 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Classes List */}
        <div className="space-y-3 min-h-[220px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted text-xs">
              <Loader2 size={24} className="animate-spin text-accent" />
              <span>Consultando horarios y cupos del día…</span>
            </div>
          ) : classes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-2xl border border-dashed border-border bg-card/30">
              <Calendar size={32} className="text-faint mb-2" />
              <p className="text-sm font-semibold text-fg">No hay clases programadas para este día</p>
              <p className="text-xs text-muted mt-1 max-w-xs">
                Seleccioná otro día en el calendario superior para ver los horarios disponibles.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {classes.map((cls) => {
                const isBooking = bookingScheduleId === cls.scheduleId;
                return (
                  <div
                    key={cls.scheduleId}
                    className="relative overflow-hidden rounded-2xl border border-border bg-card/80 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all hover:border-border-strong"
                  >
                    {/* Left color bar */}
                    <div
                      className="absolute top-0 left-0 bottom-0 w-1.5"
                      style={{ backgroundColor: cls.classColor }}
                    />

                    <div className="space-y-1.5 pl-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cls.classColor }}
                        />
                        <h4 className="font-bold text-sm text-fg tracking-tight">{cls.className}</h4>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                        <span className="flex items-center gap-1 font-semibold text-fg">
                          <Clock size={12} className="text-accent shrink-0" />
                          {cls.startTime} hs
                        </span>

                        <span className="flex items-center gap-1">
                          <Users size={12} className="text-faint shrink-0" />
                          {cls.capacity != null ? (
                            <span>
                              {cls.availableSpots != null ? cls.availableSpots : 0} de {cls.capacity} lugares libres
                            </span>
                          ) : (
                            <span>Cupo sin límite</span>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center sm:self-center pl-2 sm:pl-0 shrink-0">
                      {cls.isUserReserved ? (
                        <Badge tone="success" dot className="py-1 px-2.5 text-xs font-semibold">
                          Ya estás inscripto
                        </Badge>
                      ) : cls.isFull ? (
                        <Badge tone="neutral" className="py-1 px-2.5 text-xs">
                          Cupo completo
                        </Badge>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={isBooking}
                          onClick={() => handleBook(cls)}
                          className="text-xs w-full sm:w-auto"
                        >
                          {isBooking ? (
                            <>
                              <Loader2 size={13} className="animate-spin mr-1.5" />
                              Reservando…
                            </>
                          ) : (
                            <>
                              <Sparkles size={13} className="mr-1.5" />
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
        </div>

        <div className="pt-2 border-t border-border flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose} className="text-xs">
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
