"use client";

import { useMemo, useState } from "react";
import { Search, User, X, Check, Clock } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { dayName, type AvailableSchedule } from "@/lib/services/enrollmentService";
import type { ClientProfileForAssignment } from "@/lib/services/adminEnrollmentService";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function AssignTurnoModal({
  open,
  clients,
  schedules,
  loading,
  submitting,
  onClose,
  onAssign,
}: {
  open: boolean;
  clients: ClientProfileForAssignment[];
  schedules: AvailableSchedule[];
  loading: boolean;
  submitting: boolean;
  onClose: () => void;
  onAssign: (userId: string, scheduleId: string) => Promise<void>;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientProfileForAssignment | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);

  const matchedClients = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return clients
      .filter((c) => {
        const nameMatch = c.fullName.toLowerCase().includes(q);
        const socioMatch = c.idSocio ? c.idSocio.toLowerCase().includes(q) : false;
        const emailMatch = c.email ? c.email.toLowerCase().includes(q) : false;
        return nameMatch || socioMatch || emailMatch;
      })
      .slice(0, 15);
  }, [clients, searchQuery]);

  const sortedSchedules = useMemo(
    () =>
      [...schedules].sort((a, b) => {
        const da = DAY_ORDER.indexOf(a.dayOfWeek);
        const db = DAY_ORDER.indexOf(b.dayOfWeek);
        if (da !== db) return da - db;
        return a.startTime.localeCompare(b.startTime);
      }),
    [schedules],
  );

  const handleClose = () => {
    if (submitting) return;
    setSearchQuery("");
    setSelectedClient(null);
    setSelectedScheduleId(null);
    onClose();
  };

  const handleConfirm = async () => {
    if (!selectedClient || !selectedScheduleId) return;
    await onAssign(selectedClient.userId, selectedScheduleId);
    handleClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Asignar turno a un alumno" size="md">
      <div className="space-y-5">
        <p className="text-[11px] text-muted leading-relaxed">
          Usalo para resolver un pedido de cambio recibido por WhatsApp: el alumno queda anotado y activo de
          inmediato (sin pasar por la cola de aprobación), y se le generan las reservas de las próximas semanas.
        </p>

        {/* Client search */}
        {!selectedClient ? (
          <div className="space-y-2.5">
            <label className="block text-xs font-semibold text-fg uppercase tracking-wider">Alumno</label>
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Escribí nombre, email o ID de socio…"
                className="w-full rounded-xl border border-border bg-bg/90 py-2.5 pl-9 pr-3 text-xs text-fg placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </div>

            <div className="max-h-44 overflow-y-auto space-y-1.5 rounded-xl border border-border/60 bg-bg/40 p-1.5">
              {loading ? (
                <div className="py-6 text-center text-xs text-faint">Cargando alumnos…</div>
              ) : matchedClients.length === 0 ? (
                <div className="py-6 text-center text-xs text-faint">
                  {searchQuery.trim() ? "No se encontraron alumnos." : "Empezá a escribir para buscar."}
                </div>
              ) : (
                matchedClients.map((c) => (
                  <button
                    key={c.userId}
                    type="button"
                    onClick={() => setSelectedClient(c)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent p-2.5 text-left transition-colors hover:border-border hover:bg-card/90"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-fg truncate">{c.fullName}</span>
                        {c.idSocio && (
                          <span className="rounded-md border border-border bg-surface px-1 py-0.2 text-[10px] font-mono text-faint">
                            #{c.idSocio}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted block truncate">{c.email || "Sin email"}</span>
                    </div>
                    <span className="text-xs font-semibold text-accent shrink-0">Seleccionar →</span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <label className="block text-xs font-semibold text-fg uppercase tracking-wider">Alumno seleccionado</label>
            <div className="flex items-center justify-between rounded-2xl border border-accent/30 bg-accent/10 p-4">
              <div className="flex items-center gap-2 min-w-0">
                <User size={16} className="text-accent shrink-0" />
                <span className="font-bold text-sm text-fg truncate">{selectedClient.fullName}</span>
                {selectedClient.idSocio && (
                  <span className="rounded-md border border-accent/20 bg-accent/20 px-1.5 py-0.5 text-[10px] font-mono text-accent shrink-0">
                    #{selectedClient.idSocio}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedClient(null)}
                className="rounded-lg p-1.5 text-muted hover:bg-white/10 hover:text-fg transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Schedule picker */}
        <div className="space-y-2.5">
          <label className="block text-xs font-semibold text-fg uppercase tracking-wider">Horario a asignar</label>
          <div className="max-h-48 overflow-y-auto space-y-1.5">
            {sortedSchedules.map((s) => {
              const isSelected = selectedScheduleId === s.scheduleId;
              return (
                <button
                  key={s.scheduleId}
                  type="button"
                  onClick={() => setSelectedScheduleId(s.scheduleId)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                    isSelected ? "border-accent bg-accent/10" : "border-border bg-card/60 hover:border-border-strong"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: s.classColor }} />
                    <span className="text-xs font-semibold text-fg truncate">{s.className}</span>
                    <span className="flex items-center gap-1 text-[11px] text-muted shrink-0">
                      <Clock size={11} />
                      {dayName(s.dayOfWeek)} {s.startTime}hs
                    </span>
                  </div>
                  {s.isPendingCapacity ? (
                    <Badge tone="info">A confirmar</Badge>
                  ) : (
                    <Badge tone="neutral">{s.activeEnrollments}/{s.capacity}</Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            disabled={submitting}
            onClick={handleClose}
            className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted hover:text-fg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!selectedClient || !selectedScheduleId || submitting}
            onClick={handleConfirm}
            className="flex items-center gap-2 rounded-xl bg-accent-gradient px-5 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-95 active:scale-95 disabled:opacity-50"
          >
            <Check size={14} />
            <span>{submitting ? "Asignando…" : "Asignar turno"}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
