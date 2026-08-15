"use client";

import { useState, useMemo } from "react";
import { UserPlus, Search, Check, AlertTriangle, Calendar, Clock, User, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";
import type { Student } from "@/lib/types";
import type { AdminClassItem } from "@/lib/services/adminClassService";

interface ManualBookingModalProps {
  open: boolean;
  classItem: AdminClassItem | null;
  selectedDate: string;
  loading: boolean;
  onClose: () => void;
  onConfirmBooking: (scheduleId: string, studentId: string) => Promise<void>;
}

export function ManualBookingModal({
  open,
  classItem,
  selectedDate,
  loading,
  onClose,
  onConfirmBooking,
}: ManualBookingModalProps) {
  const students = useStore((s) => s.students);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Search filter
  const matchedStudents = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();

    return students
      .filter((s) => {
        const nameMatch = s.nombreCompleto.toLowerCase().includes(q);
        const socioMatch = s.idSocio ? s.idSocio.toLowerCase().includes(q) : false;
        const phoneMatch = s.telefono ? s.telefono.includes(q) : false;
        return nameMatch || socioMatch || phoneMatch;
      })
      .slice(0, 15);
  }, [students, searchQuery]);

  if (!classItem) return null;

  const handleConfirm = async () => {
    if (!selectedStudent) return;
    await onConfirmBooking(classItem.scheduleId, selectedStudent.id);
  };

  const handleClose = () => {
    setSelectedStudent(null);
    setSearchQuery("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Inscribir Alumno Manualmente"
      size="md"
    >
      <div className="space-y-5">
        {/* Class Context Card */}
        <div className="rounded-2xl border border-border bg-surface/80 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: classItem.classColor || "#22a058" }}
            />
            <h4 className="font-bold text-sm text-fg">{classItem.className}</h4>
          </div>

          <div className="flex items-center justify-between text-xs text-muted pt-1 border-t border-border/50">
            <span className="flex items-center gap-1">
              <Calendar size={13} className="text-accent" />
              {selectedDate}
            </span>
            <span className="flex items-center gap-1 font-semibold text-fg">
              <Clock size={13} className="text-accent" />
              {classItem.startTime} hs
            </span>
            <span className="text-accent font-medium">
              {classItem.availableSpots !== null
                ? `${classItem.availableSpots} lugares libres`
                : "Cupo pendiente"}
            </span>
          </div>
        </div>

        {/* Student Search */}
        {!selectedStudent ? (
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-fg uppercase tracking-wider">
              Buscar Alumno
            </label>
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Escribí nombre, apellido o ID de socio…"
                className="w-full rounded-xl border border-border bg-bg/90 py-2.5 pl-9 pr-3 text-xs text-fg placeholder:text-faint focus:border-accent focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Results list */}
            <div className="max-h-56 overflow-y-auto space-y-1.5 rounded-xl border border-border/60 bg-bg/40 p-1.5">
              {matchedStudents.length === 0 ? (
                <div className="py-6 text-center text-xs text-faint">
                  {searchQuery.trim()
                    ? "No se encontraron alumnos."
                    : "Empezá a escribir para buscar en el padrón de alumnos."}
                </div>
              ) : (
                matchedStudents.map((std) => (
                  <button
                    key={std.id}
                    type="button"
                    onClick={() => setSelectedStudent(std)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent p-2.5 text-left transition-colors hover:border-border hover:bg-card/90"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-fg truncate">
                          {std.nombreCompleto}
                        </span>
                        <span className="rounded-md border border-border bg-surface px-1 py-0.2 text-[10px] font-mono text-faint">
                          #{std.idSocio}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted block truncate">
                        {std.membresia || "Sin membresía registrada"}
                      </span>
                    </div>

                    <span className="text-xs font-semibold text-accent shrink-0">
                      Seleccionar →
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          /* Selected Student Card */
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-fg uppercase tracking-wider">
              Alumno Seleccionado
            </label>
            <div className="flex items-center justify-between rounded-2xl border border-accent/30 bg-accent/10 p-4">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <User size={16} className="text-accent shrink-0" />
                  <span className="font-bold text-sm text-fg truncate">
                    {selectedStudent.nombreCompleto}
                  </span>
                  <span className="rounded-md border border-accent/20 bg-accent/20 px-1.5 py-0.5 text-[10px] font-mono text-accent">
                    #{selectedStudent.idSocio}
                  </span>
                </div>
                <div className="text-xs text-muted">
                  {selectedStudent.telefono || "Sin teléfono"} • {selectedStudent.membresia || "Pase"}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="rounded-lg p-1.5 text-muted hover:bg-white/10 hover:text-fg transition-colors"
                title="Cambiar alumno"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Warning if capacity full */}
        {classItem.availableSpots === 0 && (
          <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>
              La clase se encuentra completa. El sistema validará la capacidad atómica al momento de confirmar.
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            disabled={loading}
            onClick={handleClose}
            className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted hover:text-fg transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={!selectedStudent || loading}
            onClick={handleConfirm}
            className="flex items-center gap-2 rounded-xl bg-accent-gradient px-5 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-95 active:scale-95 disabled:opacity-50"
          >
            <Check size={14} />
            <span>{loading ? "Inscribiendo…" : "Confirmar Reserva"}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
