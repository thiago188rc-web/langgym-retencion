"use client";

import { motion } from "framer-motion";
import { Users, Clock, AlertTriangle, CheckCircle2, XCircle, Sliders, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminClassItem } from "@/lib/services/adminClassService";

interface ClassCardProps {
  classItem: AdminClassItem;
  onViewAttendees: (classItem: AdminClassItem) => void;
  onEditCapacity: (classItem: AdminClassItem) => void;
}

export function ClassCard({ classItem, onViewAttendees, onEditCapacity }: ClassCardProps) {
  const isPendingCapacity = classItem.capacity === null;
  const isInactive = !classItem.scheduleActive || !classItem.classTypeActive;
  const totalBooked = classItem.confirmedCount + classItem.attendedCount;

  // Status configuration
  let badgeLabel = "DISPONIBLE";
  let badgeClass = "bg-success/15 text-success border-success/30";

  if (isInactive) {
    badgeLabel = "DESACTIVADA";
    badgeClass = "bg-white/[0.06] text-faint border-white/[0.08]";
  } else if (isPendingCapacity) {
    badgeLabel = "SIN CUPO CONFIGURADO";
    badgeClass = "bg-amber-500/15 text-amber-300 border-amber-500/30";
  } else if (classItem.availableSpots === 0 || totalBooked >= (classItem.capacity || 0)) {
    badgeLabel = "COMPLETA";
    badgeClass = "bg-danger/15 text-danger border-danger/30";
  } else if (classItem.availableSpots !== null && classItem.availableSpots <= 3) {
    badgeLabel = "ÚLTIMOS LUGARES";
    badgeClass = "bg-amber-500/15 text-amber-300 border-amber-500/30";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "group relative flex flex-col justify-between rounded-2xl border border-border bg-card/60 p-5 transition-all duration-200 hover:border-white/20 hover:bg-card/90",
        isInactive && "opacity-60 grayscale-[40%]",
      )}
    >
      {/* Accent left indicator */}
      <div
        className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full"
        style={{ backgroundColor: classItem.classColor || "#22a058" }}
      />

      <div className="space-y-4">
        {/* Header: Activity Name & Time */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full shrink-0"
                style={{ backgroundColor: classItem.classColor || "#22a058" }}
              />
              <h3 className="truncate text-base font-semibold text-fg">
                {classItem.className}
              </h3>
            </div>
            {classItem.classDescription && (
              <p className="line-clamp-1 text-xs text-muted">
                {classItem.classDescription}
              </p>
            )}
          </div>

          {/* Time Badge */}
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface/80 px-3 py-1 text-xs font-semibold text-fg shrink-0">
            <Clock size={13} className="text-accent" />
            <span className="tnum">{classItem.startTime} hs</span>
          </div>
        </div>

        {/* Status Badge & Capacity Bar */}
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between text-xs">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                badgeClass,
              )}
            >
              {isPendingCapacity && <AlertTriangle size={12} />}
              {badgeLabel}
            </span>

            {/* Occupancy Fraction */}
            <div className="text-right">
              {isPendingCapacity ? (
                <span className="text-xs text-amber-300/90 font-medium">Cupo pendiente</span>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="font-bold text-fg tnum text-sm">{totalBooked}</span>
                  <span className="text-muted text-xs">/ {classItem.capacity} cupos</span>
                </div>
              )}
            </div>
          </div>

          {/* Visual Progress Bar */}
          {!isPendingCapacity && classItem.capacity && (
            <div className="space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={cn(
                    "h-full transition-all duration-300",
                    classItem.occupancyPercent! >= 100
                      ? "bg-danger"
                      : classItem.occupancyPercent! >= 80
                        ? "bg-amber-500"
                        : "bg-accent",
                  )}
                  style={{ width: `${Math.min(100, classItem.occupancyPercent || 0)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-faint">
                <span>
                  {classItem.availableSpots !== null ? (
                    classItem.availableSpots === 0 ? (
                      <span className="text-danger font-medium">Sin lugares</span>
                    ) : (
                      <span>{classItem.availableSpots} lugares libres</span>
                    )
                  ) : null}
                </span>
                <span className="tnum font-medium text-muted">
                  {classItem.occupancyPercent}% ocupación
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Breakdown counters */}
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-border/60 bg-surface/40 p-2.5 text-center text-[11px]">
          <div>
            <span className="block text-faint">Inscriptos</span>
            <span className="font-semibold text-fg tnum text-xs">{classItem.confirmedCount}</span>
          </div>
          <div>
            <span className="block text-faint">Presentes</span>
            <span className="font-semibold text-success tnum text-xs">{classItem.attendedCount}</span>
          </div>
          <div>
            <span className="block text-faint">Ausentes</span>
            <span className="font-semibold text-danger tnum text-xs">{classItem.noShowCount}</span>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="mt-5 flex items-center gap-2 pt-2 border-t border-border/50">
        <button
          type="button"
          onClick={() => onViewAttendees(classItem)}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-gradient py-2.5 px-3 text-xs font-semibold text-white shadow-sm transition-all hover:opacity-95 active:scale-[0.98]"
        >
          <Users size={14} />
          <span>Ver Inscriptos ({totalBooked})</span>
        </button>

        <button
          type="button"
          onClick={() => onEditCapacity(classItem)}
          title="Modificar cupo"
          aria-label="Modificar cupo"
          className="flex size-9 items-center justify-center rounded-xl border border-border bg-surface/80 text-muted transition-colors hover:border-white/20 hover:text-fg active:scale-[0.96]"
        >
          <Sliders size={14} />
        </button>
      </div>
    </motion.div>
  );
}
