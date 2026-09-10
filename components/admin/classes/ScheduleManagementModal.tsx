"use client";

import { useState } from "react";
import { Sliders, Calendar, Clock, AlertTriangle, Check, Power, ShieldAlert, X, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import {
  type FullClassTypeItem,
  type FullScheduleItem,
  updateScheduleCapacity,
  toggleScheduleActive,
  createClassSchedule,
  createClassType,
  deleteClassSchedule,
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
  const [formError, setFormError] = useState<string | null>(null);

  // Form states
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [newDay, setNewDay] = useState<number>(5); // Default Friday
  const [newTime, setNewTime] = useState<string>("19:00");
  const [newCapacity, setNewCapacity] = useState<string>("15");

  const [showAddType, setShowAddType] = useState(false);
  const [newTypeName, setNewTypeName] = useState<string>("");
  const [newTypeDesc, setNewTypeDesc] = useState<string>("");
  const [newTypeColor, setNewTypeColor] = useState<string>("#a855f7");
  const [newTypeDefaultCap, setNewTypeDefaultCap] = useState<string>("15");

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

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeType) return;
    setFormError(null);
    setActionLoading(true);
    try {
      const capNum = newCapacity.trim() ? Number(newCapacity) : null;
      const res = await createClassSchedule({
        classTypeId: activeType.id,
        dayOfWeek: Number(newDay),
        startTime: newTime,
        capacity: capNum,
      });
      if (res.error) {
        setFormError(res.error);
      } else {
        setShowAddSchedule(false);
        await onRefresh();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeName.trim()) return;
    setFormError(null);
    setActionLoading(true);
    try {
      const capNum = newTypeDefaultCap.trim() ? Number(newTypeDefaultCap) : null;
      const res = await createClassType({
        name: newTypeName.trim(),
        description: newTypeDesc.trim() || undefined,
        color: newTypeColor,
        defaultCapacity: capNum,
      });
      if (res.error) {
        setFormError(res.error);
      } else {
        setShowAddType(false);
        setNewTypeName("");
        setNewTypeDesc("");
        await onRefresh();
        if (res.data?.id) {
          setSelectedTypeId(res.data.id);
        }
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm("¿Estás seguro de eliminar este horario recurrente?")) return;
    setActionLoading(true);
    try {
      await deleteClassSchedule(scheduleId);
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
        {formError && (
          <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
            {formError}
          </div>
        )}

        {/* Activity Tabs + Add Activity Button */}
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
                  setShowAddSchedule(false);
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

          <button
            type="button"
            onClick={() => {
              setShowAddType(!showAddType);
              setShowAddSchedule(false);
            }}
            className="flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-fg hover:border-accent/40 transition-colors shrink-0"
          >
            <Plus size={13} className="text-accent" />
            <span>Nueva Actividad</span>
          </button>
        </div>

        {/* Add New Activity Form */}
        {showAddType && (
          <form
            onSubmit={handleCreateType}
            className="rounded-2xl border border-accent/30 bg-card/90 p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-fg">Crear Nueva Actividad</h4>
              <button
                type="button"
                onClick={() => setShowAddType(false)}
                className="text-muted hover:text-fg"
              >
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted block mb-1">Nombre de la actividad</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Yoga Deportivo, Pilates, etc."
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-xs text-fg focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted block mb-1">Cupo por defecto</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  placeholder="Ej. 15"
                  value={newTypeDefaultCap}
                  onChange={(e) => setNewTypeDefaultCap(e.target.value)}
                  className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-xs text-fg focus:border-accent focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[11px] font-medium text-muted block mb-1">Descripción</label>
                <input
                  type="text"
                  placeholder="Breve descripción o requisitos"
                  value={newTypeDesc}
                  onChange={(e) => setNewTypeDesc(e.target.value)}
                  className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-xs text-fg focus:border-accent focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddType(false)}
                className="rounded-xl border border-border px-3 py-1.5 text-xs text-muted hover:text-fg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="rounded-xl bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:opacity-95"
              >
                {actionLoading ? "Guardando..." : "Guardar Actividad"}
              </button>
            </div>
          </form>
        )}

        {/* Selected Activity Details */}
        {activeType && (
          <div className="space-y-4">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border bg-surface/60 p-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: activeType.color }}
                  />
                  <h4 className="font-bold text-base text-fg">{activeType.name}</h4>
                </div>
                <p className="text-xs text-muted">
                  {activeType.description || "Sin descripción"}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right text-xs">
                  <span className="text-faint block">Horarios programados</span>
                  <span className="font-bold text-fg">{activeType.schedules.length} slots semanales</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddSchedule(!showAddSchedule)}
                  className="flex items-center gap-1.5 rounded-xl bg-accent/20 border border-accent/40 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/30 transition-colors"
                >
                  <Plus size={13} />
                  <span>Agregar Horario</span>
                </button>
              </div>
            </div>

            {/* Add Schedule Form for current activity */}
            {showAddSchedule && (
              <form
                onSubmit={handleCreateSchedule}
                className="rounded-2xl border border-accent/40 bg-card p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h5 className="font-semibold text-xs text-fg">
                    Agregar horario para <strong className="text-accent">{activeType.name}</strong>
                  </h5>
                  <button
                    type="button"
                    onClick={() => setShowAddSchedule(false)}
                    className="text-muted hover:text-fg"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-muted block mb-1">Día de la semana</label>
                    <select
                      value={newDay}
                      onChange={(e) => setNewDay(Number(e.target.value))}
                      className="w-full rounded-xl border border-border bg-bg px-2.5 py-2 text-xs text-fg focus:border-accent focus:outline-none"
                    >
                      <option value={1}>Lunes</option>
                      <option value={2}>Martes</option>
                      <option value={3}>Miércoles</option>
                      <option value={4}>Jueves</option>
                      <option value={5}>Viernes</option>
                      <option value={6}>Sábado</option>
                      <option value={0}>Domingo</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-muted block mb-1">Hora de inicio</label>
                    <input
                      type="time"
                      required
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      className="w-full rounded-xl border border-border bg-bg px-2.5 py-2 text-xs text-fg focus:border-accent focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-muted block mb-1">Cupo máximo</label>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      placeholder="Ej. 15"
                      value={newCapacity}
                      onChange={(e) => setNewCapacity(e.target.value)}
                      className="w-full rounded-xl border border-border bg-bg px-2.5 py-2 text-xs text-fg focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddSchedule(false)}
                    className="rounded-xl border border-border px-3 py-1.5 text-xs text-muted hover:text-fg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="rounded-xl bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:opacity-95"
                  >
                    {actionLoading ? "Guardando..." : "Confirmar Horario"}
                  </button>
                </div>
              </form>
            )}

            {/* Schedules Grid */}
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {activeType.schedules.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted">
                  No hay horarios cargados para esta actividad. Hacé clic en "Agregar Horario" para crear uno.
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

                        {/* Delete Button */}
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleDeleteSchedule(sch.id)}
                          title="Eliminar horario"
                          aria-label="Eliminar horario"
                          className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface text-muted hover:text-danger hover:border-danger/30 hover:bg-danger/10 transition-colors"
                        >
                          <Trash2 size={13} />
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

