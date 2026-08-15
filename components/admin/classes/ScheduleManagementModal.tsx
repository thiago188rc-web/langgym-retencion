"use client";

import { useState } from "react";
import { Sliders, Calendar, Clock, AlertTriangle, Check, Power, ShieldAlert, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import {
  type FullClassTypeItem,
  type FullScheduleItem,
  updateScheduleCapacity,
  toggleScheduleActive,
} from "@/lib/services/adminClassService";

interface ScheduleManagementModalProps {
  open: boolean;
  classTypes: FullClassTypeItem[];
  loading: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function ScheduleManagementModal({
  open,
  classTypes,
  loading,
  onClose,
  onRefresh,
}: ScheduleManagementModalProps) {
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [editingCapacityScheduleId, setEditingCapacityScheduleId] = useState<string | null>(null);
  const [capacityInput, setCapacityInput] = useState<string>("");
  const [actionLoading, setActionLoading] = useState(false);

  const activeType = classTypes.find((t) => t.id === (selectedTypeId || classTypes[0]?.id));

  const handleToggleActive = async (schedule: FullScheduleItem) => {
    setActionLoading(true);
    try {
      await toggleScheduleActive(schedule.id, !schedule.active);
      await onRefresh();
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartEditCapacity = (schedule: FullScheduleItem) => {
    setEditingCapacityScheduleId(schedule.id);
    setCapacityInput(schedule.capacity != null ? String(schedule.capacity) : "");
  };

  const handleSaveCapacity = async (scheduleId: string) => {
    setActionLoading(true);
    try {
      const num = capacityInput.trim() === "" ? null : Number(capacityInput);
      await updateScheduleCapacity(scheduleId, num);
      setEditingCapacityScheduleId(null);
      await onRefresh();
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gestión de Horarios y Actividades"
      size="xl"
    >
      <div className="space-y-6">
        {/* Activity Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-border">
          {classTypes.map((ct) => {
            const isSelected = ct.id === activeType?.id;
            return (
              <button
                key={ct.id}
                type="button"
                onClick={() => {
                  setSelectedTypeId(ct.id);
                  setEditingCapacityScheduleId(null);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all shrink-0",
                  isSelected
                    ? "bg-card text-fg ring-1 ring-accent/30 shadow-sm"
                    : "text-muted hover:text-fg hover:bg-white/[0.04]",
                )}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: ct.color }}
                />
                <span>{ct.name}</span>
                <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-mono text-faint">
                  {ct.schedules.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Activity Details */}
        {activeType && (
          <div className="space-y-4">
            {/* Header info */}
            <div className="flex items-center justify-between rounded-2xl border border-border bg-surface/60 p-4">
              <div className="space-y-0.5">
                <h4 className="font-bold text-sm text-fg">{activeType.name}</h4>
                <p className="text-xs text-muted">
                  {activeType.description || "Sin descripción"}
                </p>
              </div>

              <div className="text-right text-xs">
                <span className="text-faint block">Horarios programados</span>
                <span className="font-bold text-fg">{activeType.schedules.length} slots semanales</span>
              </div>
            </div>

            {/* Schedules Grid */}
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {activeType.schedules.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted">
                  No hay horarios cargados para esta actividad.
                </div>
              ) : (
                activeType.schedules.map((sch) => {
                  const isEditingCap = editingCapacityScheduleId === sch.id;
                  const dayName = DAY_NAMES[sch.dayOfWeek] || "Día";

                  return (
                    <div
                      key={sch.id}
                      className={cn(
                        "flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border bg-card/60 p-3.5 transition-all",
                        !sch.active && "opacity-50 grayscale-[50%]",
                      )}
                    >
                      {/* Day & Time */}
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-surface text-accent font-bold text-xs shrink-0">
                          {dayName.slice(0, 3).toUpperCase()}
                        </div>

                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-fg">
                              {dayName} • {sch.startTime} hs
                            </span>
                            {!sch.active && (
                              <span className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px] text-faint">
                                Inactivo
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted block">
                            {sch.capacity != null ? (
                              <strong className="text-fg">{sch.capacity} cupos máximos</strong>
                            ) : (
                              <span className="text-amber-300 font-medium">
                                Cupo pendiente (no permite reservas)
                              </span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Capacity Editing & Controls */}
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        {isEditingCap ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="1"
                              max="500"
                              value={capacityInput}
                              onChange={(e) => setCapacityInput(e.target.value)}
                              placeholder="Ej. 15"
                              className="w-20 rounded-xl border border-accent bg-bg px-2.5 py-1 text-xs font-bold text-fg focus:outline-none"
                            />
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => handleSaveCapacity(sch.id)}
                              className="rounded-xl bg-accent px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCapacityScheduleId(null)}
                              className="rounded-xl border border-border px-2 py-1 text-xs text-muted hover:text-fg"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartEditCapacity(sch)}
                            className="rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted hover:text-fg hover:border-white/20 transition-colors"
                          >
                            Editar Cupo
                          </button>
                        )}

                        {/* Enable / Disable Button */}
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleToggleActive(sch)}
                          title={sch.active ? "Desactivar horario" : "Activar horario"}
                          aria-label={sch.active ? "Desactivar horario" : "Activar horario"}
                          className={cn(
                            "flex size-8 items-center justify-center rounded-xl border transition-colors",
                            sch.active
                              ? "border-border bg-surface text-muted hover:text-danger hover:border-danger/30 hover:bg-danger/10"
                              : "border-success/30 bg-success/15 text-success hover:bg-success/25",
                          )}
                        >
                          <Power size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-surface border border-border px-5 py-2 text-xs font-semibold text-fg hover:bg-card transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  );
}
