"use client";

import { useState, useEffect } from "react";
import { Sliders, AlertTriangle, Check, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { AdminClassItem } from "@/lib/services/adminClassService";

interface EditCapacityModalProps {
  open: boolean;
  classItem: AdminClassItem | null;
  loading: boolean;
  onClose: () => void;
  onSaveCapacity: (scheduleId: string, newCapacity: number | null) => Promise<void>;
}

export function EditCapacityModal({
  open,
  classItem,
  loading,
  onClose,
  onSaveCapacity,
}: EditCapacityModalProps) {
  const [capacityInput, setCapacityInput] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (classItem) {
      setCapacityInput(classItem.capacity != null ? String(classItem.capacity) : "");
      setErrorMsg(null);
    }
  }, [classItem, open]);

  if (!classItem) return null;

  const currentBooked = classItem.confirmedCount + classItem.attendedCount;
  const numValue = capacityInput.trim() === "" ? null : Number(capacityInput);
  const isLowerThanBooked = numValue !== null && numValue < currentBooked;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (numValue !== null) {
      if (isNaN(numValue) || !Number.isInteger(numValue) || numValue <= 0) {
        setErrorMsg("Ingresá un número entero positivo para el cupo (mínimo 1).");
        return;
      }

      if (numValue > 500) {
        setErrorMsg("El cupo no puede superar los 500 lugares.");
        return;
      }
    }

    await onSaveCapacity(classItem.scheduleId, numValue);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Modificar Cupo de Clase"
      size="md"
    >
      <form onSubmit={handleSave} className="space-y-5">
        {/* Class summary card */}
        <div className="flex items-center justify-between rounded-2xl border border-border bg-surface/80 p-4">
          <div className="space-y-0.5">
            <h4 className="font-semibold text-sm text-fg">{classItem.className}</h4>
            <span className="text-xs text-muted">
              Horario: <strong className="text-fg">{classItem.startTime} hs</strong>
            </span>
          </div>

          <div className="text-right">
            <span className="text-xs text-faint block">Reservas actuales</span>
            <span className="text-sm font-bold text-fg tnum">
              {currentBooked} alumnos
            </span>
          </div>
        </div>

        {/* Input */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-fg uppercase tracking-wider">
            Cupo Máximo
          </label>
          <div className="relative">
            <input
              type="number"
              min="1"
              max="500"
              step="1"
              value={capacityInput}
              onChange={(e) => setCapacityInput(e.target.value)}
              placeholder="Ej. 30 (o dejar vacío para 'Sin cupo')"
              className="w-full rounded-xl border border-border bg-bg/90 p-3 text-base font-bold text-fg placeholder:text-faint placeholder:font-normal focus:border-accent focus:outline-none"
            />
          </div>
          <p className="text-[11px] text-muted leading-relaxed">
            {classItem.capacity === null
              ? "Esta clase actualmente tiene cupo pendiente. Al definir un número quedará habilitada para reservas."
              : "Establecé el límite de alumnos que pueden anotarse a este horario semanal."}
          </p>
        </div>

        {/* Warning if lower than current booked */}
        {isLowerThanBooked && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200">
            <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-amber-300">
                Atención: Reducción de cupo
              </span>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                Hay <strong>{currentBooked} personas</strong> reservadas y estás estableciendo un cupo de <strong>{numValue}</strong>. Ninguna reserva será cancelada automáticamente, pero la clase figurará como completa hasta que se liberen lugares.
              </p>
            </div>
          </div>
        )}

        {/* Error message */}
        {errorMsg && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
            {errorMsg}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted hover:text-fg transition-colors"
          >
            Cancelar
          </button>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-accent-gradient px-5 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-95 active:scale-95 disabled:opacity-50"
          >
            <Check size={14} />
            <span>{loading ? "Guardando…" : "Guardar Cupo"}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
