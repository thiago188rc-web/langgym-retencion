"use client";

import { useState, useMemo } from "react";
import {
  Users,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  UserPlus,
  AlertTriangle,
  RotateCcw,
  MessageCircle,
  Phone,
  Calendar,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import type { AdminClassItem, ClassAttendee } from "@/lib/services/adminClassService";

interface ClassAttendeesModalProps {
  open: boolean;
  classItem: AdminClassItem | null;
  selectedDate: string;
  attendees: ClassAttendee[];
  loading: boolean;
  onClose: () => void;
  onUpdateAttendance: (reservationId: string, status: "attended" | "no_show" | "confirmed") => Promise<void>;
  onCancelReservation: (attendee: ClassAttendee) => void;
  onOpenManualBooking: () => void;
}

type FilterTab = "all" | "confirmed" | "attended" | "no_show" | "cancelled";

export function ClassAttendeesModal({
  open,
  classItem,
  selectedDate,
  attendees,
  loading,
  onClose,
  onUpdateAttendance,
  onCancelReservation,
  onOpenManualBooking,
}: ClassAttendeesModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // Filtered attendees
  const filteredAttendees = useMemo(() => {
    let list = attendees;

    // Filter by tab
    if (activeTab !== "all") {
      list = list.filter((a) => a.status === activeTab);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((a) => {
        const nameMatch = a.displayName.toLowerCase().includes(q);
        const socioMatch = a.idSocio ? a.idSocio.toLowerCase().includes(q) : false;
        const phoneMatch = a.phone ? a.phone.includes(q) : false;
        const emailMatch = a.email ? a.email.toLowerCase().includes(q) : false;
        return nameMatch || socioMatch || phoneMatch || emailMatch;
      });
    }

    return list;
  }, [attendees, activeTab, searchQuery]);

  // Attendance metrics
  const stats = useMemo(() => {
    const total = attendees.filter((a) => a.status !== "cancelled").length;
    const attended = attendees.filter((a) => a.status === "attended").length;
    const noShow = attendees.filter((a) => a.status === "no_show").length;
    const confirmed = attendees.filter((a) => a.status === "confirmed").length;
    const cancelled = attendees.filter((a) => a.status === "cancelled").length;

    return { total, attended, noShow, confirmed, cancelled };
  }, [attendees]);

  if (!classItem) return null;

  const handleAttendanceClick = async (
    reservationId: string,
    status: "attended" | "no_show" | "confirmed",
  ) => {
    setActionInProgressId(reservationId);
    try {
      await onUpdateAttendance(reservationId, status);
    } finally {
      setActionInProgressId(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title=""
      size="xl"
      bodyClassName="p-0 overflow-hidden"
    >
      <div className="flex flex-col h-[82vh] max-h-[800px]">
        {/* Modal Header */}
        <div className="border-b border-border bg-surface/90 p-5 sm:p-6 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="size-3 rounded-full shrink-0"
                  style={{ backgroundColor: classItem.classColor || "#22a058" }}
                />
                <h2 className="text-xl font-bold text-fg truncate">
                  {classItem.className}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                <span className="flex items-center gap-1">
                  <Calendar size={13} className="text-accent" />
                  {selectedDate}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 font-semibold text-fg">
                  <Clock size={13} className="text-accent" />
                  {classItem.startTime} hs
                </span>
                <span>•</span>
                <span className="text-fg font-medium">
                  {classItem.capacity ? `${classItem.capacity} cupos totales` : "Cupo pendiente"}
                </span>
              </div>
            </div>

            {/* Manual Add Student Button */}
            <button
              type="button"
              onClick={onOpenManualBooking}
              className="flex items-center gap-2 rounded-xl bg-accent-gradient px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-95 active:scale-95 shrink-0"
            >
              <UserPlus size={15} />
              <span>Agregar Alumno</span>
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-xl border border-border/80 bg-card/60 p-2.5 text-center">
              <span className="text-[11px] text-faint block">Inscriptos</span>
              <span className="text-base font-bold text-fg tnum">{stats.total}</span>
            </div>
            <div className="rounded-xl border border-border/80 bg-card/60 p-2.5 text-center">
              <span className="text-[11px] text-faint block">Presentes</span>
              <span className="text-base font-bold text-success tnum">{stats.attended}</span>
            </div>
            <div className="rounded-xl border border-border/80 bg-card/60 p-2.5 text-center">
              <span className="text-[11px] text-faint block">Ausentes</span>
              <span className="text-base font-bold text-danger tnum">{stats.noShow}</span>
            </div>
            <div className="rounded-xl border border-border/80 bg-card/60 p-2.5 text-center">
              <span className="text-[11px] text-faint block">Lugares Libres</span>
              <span className="text-base font-bold text-accent tnum">
                {classItem.availableSpots !== null ? classItem.availableSpots : "—"}
              </span>
            </div>
          </div>

          {/* Search and Tabs */}
          <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, ID socio o teléfono…"
                className="w-full rounded-xl border border-border bg-bg/90 py-2 pl-9 pr-3 text-xs text-fg placeholder:text-faint focus:border-accent focus:outline-none"
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

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-bg/60 p-1 text-[11px] shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={cn(
                  "rounded-lg px-2.5 py-1 font-medium transition-colors",
                  activeTab === "all" ? "bg-card text-fg font-semibold shadow-xs" : "text-muted hover:text-fg",
                )}
              >
                Todos ({attendees.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("confirmed")}
                className={cn(
                  "rounded-lg px-2.5 py-1 font-medium transition-colors",
                  activeTab === "confirmed" ? "bg-card text-fg font-semibold shadow-xs" : "text-muted hover:text-fg",
                )}
              >
                Pendientes ({stats.confirmed})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("attended")}
                className={cn(
                  "rounded-lg px-2.5 py-1 font-medium transition-colors",
                  activeTab === "attended" ? "bg-card text-success font-semibold shadow-xs" : "text-muted hover:text-fg",
                )}
              >
                Presentes ({stats.attended})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("no_show")}
                className={cn(
                  "rounded-lg px-2.5 py-1 font-medium transition-colors",
                  activeTab === "no_show" ? "bg-card text-danger font-semibold shadow-xs" : "text-muted hover:text-fg",
                )}
              >
                Ausentes ({stats.noShow})
              </button>
            </div>
          </div>
        </div>

        {/* Attendees List (Scrollable Area) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <span className="text-xs text-faint animate-pulse">Cargando inscriptos…</span>
            </div>
          ) : filteredAttendees.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/80 p-6 text-center">
              <Users size={28} className="text-faint" />
              <p className="text-sm font-medium text-muted">
                {searchQuery ? "No se encontraron alumnos con esa búsqueda." : "No hay alumnos inscriptos para este horario."}
              </p>
              {!searchQuery && (
                <button
                  type="button"
                  onClick={onOpenManualBooking}
                  className="mt-2 text-xs font-semibold text-accent hover:underline"
                >
                  + Agregar primer alumno manualmente
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredAttendees.map((attendee, idx) => {
                const isProcessing = actionInProgressId === attendee.reservationId;
                const isAttended = attendee.status === "attended";
                const isNoShow = attendee.status === "no_show";
                const isCancelled = attendee.status === "cancelled";

                return (
                  <div
                    key={attendee.reservationId}
                    className={cn(
                      "flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border bg-card/60 p-3.5 transition-colors hover:bg-card/90",
                      isCancelled && "opacity-50 grayscale",
                    )}
                  >
                    {/* Alumno Info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex size-7 items-center justify-center rounded-xl bg-surface text-xs font-bold text-muted tnum shrink-0">
                        {String(idx + 1).padStart(2, "0")}
                      </span>

                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-fg truncate">
                            {attendee.displayName}
                          </span>
                          {attendee.idSocio && (
                            <span className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px] font-mono text-faint">
                              Socio #{attendee.idSocio}
                            </span>
                          )}
                          {attendee.membership && (
                            <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent truncate max-w-[150px]">
                              {attendee.membership}
                            </span>
                          )}
                        </div>

                        {/* Contact details */}
                        <div className="flex items-center gap-3 text-xs text-muted">
                          {attendee.phone && (
                            <span className="flex items-center gap-1 tnum">
                              <Phone size={11} className="text-faint" />
                              {attendee.phone}
                            </span>
                          )}
                          {attendee.phone && (
                            <a
                              href={`https://wa.me/${attendee.phone.replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                            >
                              <MessageCircle size={11} />
                              WhatsApp
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Status & Action Buttons */}
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {/* Current Status Pill */}
                      {isAttended && (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-success/30 bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success">
                          <CheckCircle2 size={12} />
                          PRESENTE
                        </span>
                      )}
                      {isNoShow && (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-danger/30 bg-danger/15 px-2.5 py-1 text-[11px] font-semibold text-danger">
                          <XCircle size={12} />
                          AUSENTE
                        </span>
                      )}
                      {isCancelled && (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-faint">
                          CANCELADO
                        </span>
                      )}

                      {/* Interactive Buttons if active */}
                      {!isCancelled && (
                        <div className="flex items-center gap-1.5">
                          {/* Presente Button */}
                          <button
                            type="button"
                            disabled={isProcessing || isAttended}
                            onClick={() => handleAttendanceClick(attendee.reservationId, "attended")}
                            title="Marcar Presente"
                            className={cn(
                              "flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all active:scale-95",
                              isAttended
                                ? "bg-success/20 text-success ring-1 ring-success/40"
                                : "border border-border bg-surface text-muted hover:border-success/40 hover:bg-success/10 hover:text-success",
                            )}
                          >
                            <CheckCircle2 size={13} />
                            <span>Presente</span>
                          </button>

                          {/* Ausente Button */}
                          <button
                            type="button"
                            disabled={isProcessing || isNoShow}
                            onClick={() => handleAttendanceClick(attendee.reservationId, "no_show")}
                            title="Marcar Ausente"
                            className={cn(
                              "flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all active:scale-95",
                              isNoShow
                                ? "bg-danger/20 text-danger ring-1 ring-danger/40"
                                : "border border-border bg-surface text-muted hover:border-danger/40 hover:bg-danger/10 hover:text-danger",
                            )}
                          >
                            <XCircle size={13} />
                            <span>Ausente</span>
                          </button>

                          {/* Reset status button if already attended/noShow */}
                          {(isAttended || isNoShow) && (
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => handleAttendanceClick(attendee.reservationId, "confirmed")}
                              title="Restablecer a Pendiente"
                              aria-label="Restablecer a Pendiente"
                              className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface text-muted hover:text-fg transition-colors"
                            >
                              <RotateCcw size={12} />
                            </button>
                          )}

                          {/* Cancel Reservation Button */}
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => onCancelReservation(attendee)}
                            title="Cancelar reserva"
                            aria-label="Cancelar reserva"
                            className="flex size-8 items-center justify-center rounded-xl border border-border bg-surface text-faint hover:bg-danger/15 hover:text-danger hover:border-danger/30 transition-colors"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
