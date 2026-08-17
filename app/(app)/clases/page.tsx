"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Sliders,
  CalendarCheck,
  Users,
  Clock,
  Sparkles,
  RefreshCw,
  Plus,
} from "lucide-react";
import { getArgentinaTodayISO, shiftDateDays, formatShortDate } from "@/lib/dates";
import {
  getAdminClassesForDate,
  getClassAttendees,
  updateReservationAttendance,
  adminCancelReservation,
  adminManualBookClass,
  updateScheduleCapacity,
  getAllClassTypesAndSchedules,
  type AdminClassItem,
  type ClassAttendee,
  type FullClassTypeItem,
} from "@/lib/services/adminClassService";
import { ClassCard } from "@/components/admin/classes/ClassCard";
import { ClassAttendeesModal } from "@/components/admin/classes/ClassAttendeesModal";
import { EditCapacityModal } from "@/components/admin/classes/EditCapacityModal";
import { ManualBookingModal } from "@/components/admin/classes/ManualBookingModal";
import { ScheduleManagementModal } from "@/components/admin/classes/ScheduleManagementModal";
import { PendingEnrollmentsSection } from "@/components/admin/classes/PendingEnrollmentsSection";
import { ActiveEnrollmentsSection } from "@/components/admin/classes/ActiveEnrollmentsSection";
import { Modal } from "@/components/ui/Modal";
import { useToast, ToastViewport } from "@/components/ui/Toast";
import {
  getPendingEnrollmentRequests,
  approveClassEnrollment,
  rejectClassEnrollment,
  getActiveEnrollments,
  cancelClassEnrollment,
  type PendingEnrollmentRequest,
  type ActiveEnrollment,
} from "@/lib/services/adminEnrollmentService";

const DAYS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function formatFullDateHeader(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayName = DAYS_ES[dateObj.getUTCDay()];
  const monthName = MONTHS_ES[m - 1];
  return `${dayName.toUpperCase()} ${d} DE ${monthName.toUpperCase()} DE ${y}`;
}

export default function AdminClassesPage() {
  const toast = useToast();
  const todayISO = useMemo(() => getArgentinaTodayISO(), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayISO);

  const [classes, setClasses] = useState<AdminClassItem[]>([]);
  const [loadingClasses, setLoadingClasses] = useState<boolean>(true);

  // Attendees Modal state
  const [selectedClassForAttendees, setSelectedClassForAttendees] = useState<AdminClassItem | null>(null);
  const [attendeesList, setAttendeesList] = useState<ClassAttendee[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState<boolean>(false);

  // Edit Capacity Modal state
  const [selectedClassForCapacity, setSelectedClassForCapacity] = useState<AdminClassItem | null>(null);
  const [savingCapacity, setSavingCapacity] = useState<boolean>(false);

  // Manual Booking Modal state
  const [manualBookingOpen, setManualBookingOpen] = useState<boolean>(false);
  const [bookingLoading, setBookingLoading] = useState<boolean>(false);

  // Schedule Management Modal state
  const [scheduleModalOpen, setScheduleModalOpen] = useState<boolean>(false);
  const [allClassTypes, setAllClassTypes] = useState<FullClassTypeItem[]>([]);
  const [loadingScheduleModal, setLoadingScheduleModal] = useState<boolean>(false);

  // Cancellation Confirmation Modal state
  const [cancelModalOpen, setCancelModalOpen] = useState<boolean>(false);
  const [attendeeToCancel, setAttendeeToCancel] = useState<ClassAttendee | null>(null);
  const [cancelling, setCancelling] = useState<boolean>(false);

  // Pending Turno Requests state
  const [pendingRequests, setPendingRequests] = useState<PendingEnrollmentRequest[]>([]);
  const [loadingPendingRequests, setLoadingPendingRequests] = useState<boolean>(true);

  // Active Turnos state
  const [activeEnrollments, setActiveEnrollments] = useState<ActiveEnrollment[]>([]);
  const [loadingActiveEnrollments, setLoadingActiveEnrollments] = useState<boolean>(true);

  // 1. Fetch Classes for selected Date
  const fetchClasses = useCallback(async (dateISO: string) => {
    setLoadingClasses(true);
    const { data, error } = await getAdminClassesForDate(dateISO);
    if (error) {
      toast.push(error, "danger");
      setClasses([]);
    } else {
      setClasses(data);
    }
    setLoadingClasses(false);
  }, [toast]);

  // 2. Fetch Attendees for current modal
  const fetchAttendees = useCallback(async (scheduleId: string, dateISO: string) => {
    setLoadingAttendees(true);
    const { data, error } = await getClassAttendees(scheduleId, dateISO);
    if (error) {
      toast.push(error, "danger");
      setAttendeesList([]);
    } else {
      setAttendeesList(data);
    }
    setLoadingAttendees(false);
  }, [toast]);

  // Fetch Pending Turno Requests
  const fetchPendingRequests = useCallback(async () => {
    setLoadingPendingRequests(true);
    const { data, error } = await getPendingEnrollmentRequests();
    if (error) {
      toast.push(error, "danger");
    }
    setPendingRequests(data);
    setLoadingPendingRequests(false);
  }, [toast]);

  // Fetch Active Turnos
  const fetchActiveEnrollments = useCallback(async () => {
    setLoadingActiveEnrollments(true);
    const { data, error } = await getActiveEnrollments();
    if (error) {
      toast.push(error, "danger");
    }
    setActiveEnrollments(data);
    setLoadingActiveEnrollments(false);
  }, [toast]);

  // Initial and Date-change trigger
  useEffect(() => {
    fetchClasses(selectedDate);
  }, [selectedDate, fetchClasses]);

  useEffect(() => {
    fetchPendingRequests();
    fetchActiveEnrollments();
  }, [fetchPendingRequests, fetchActiveEnrollments]);

  // Handle Approve/Reject Turno Requests
  const handleApproveEnrollment = async (enrollmentId: string) => {
    const res = await approveClassEnrollment(enrollmentId);
    if (res.success) {
      toast.push(
        `Turno aceptado. Se generaron ${res.reservationsGenerated ?? 0} reservas para las próximas semanas.`,
        "success",
      );
      await Promise.all([fetchPendingRequests(), fetchActiveEnrollments(), fetchClasses(selectedDate)]);
    } else {
      toast.push(res.error || "No se pudo aceptar el turno.", "danger");
    }
  };

  const handleRejectEnrollment = async (enrollmentId: string) => {
    const res = await rejectClassEnrollment(enrollmentId);
    if (res.success) {
      toast.push("Solicitud de turno rechazada.", "info");
      await fetchPendingRequests();
    } else {
      toast.push(res.error || "No se pudo rechazar la solicitud.", "danger");
    }
  };

  // Handle Cancel Active Turno
  const handleCancelActiveEnrollment = async (enrollmentId: string) => {
    const res = await cancelClassEnrollment(enrollmentId);
    if (res.success) {
      toast.push(
        `Turno liberado. Se cancelaron ${res.reservationsCancelled ?? 0} reservas futuras.`,
        "info",
      );
      await Promise.all([fetchActiveEnrollments(), fetchClasses(selectedDate)]);
    } else {
      toast.push(res.error || "No se pudo liberar el turno.", "danger");
    }
  };

  // Handle Attendees Click
  const handleOpenAttendees = (classItem: AdminClassItem) => {
    setSelectedClassForAttendees(classItem);
    fetchAttendees(classItem.scheduleId, selectedDate);
  };

  // Handle Attendance Update (Presente / Ausente)
  const handleUpdateAttendance = async (
    reservationId: string,
    status: "attended" | "no_show" | "confirmed",
  ) => {
    const res = await updateReservationAttendance(reservationId, status);
    if (res.success) {
      const statusLabel =
        status === "attended" ? "presente" : status === "no_show" ? "ausente" : "pendiente";
      toast.push(`Asistencia registrada: ${statusLabel}`, "success");
      // Refresh current attendees and class list
      if (selectedClassForAttendees) {
        await Promise.all([
          fetchAttendees(selectedClassForAttendees.scheduleId, selectedDate),
          fetchClasses(selectedDate),
        ]);
      }
    } else {
      toast.push(res.error || "No se pudo registrar la asistencia.", "danger");
    }
  };

  // Handle Cancellation confirmation open
  const handleOpenCancelConfirmation = (attendee: ClassAttendee) => {
    setAttendeeToCancel(attendee);
    setCancelModalOpen(true);
  };

  // Execute Cancellation
  const handleConfirmCancelReservation = async () => {
    if (!attendeeToCancel) return;
    setCancelling(true);

    try {
      const res = await adminCancelReservation(attendeeToCancel.reservationId);
      if (res.success) {
        toast.push(
          `Reserva de ${attendeeToCancel.displayName} cancelada. Lugar liberado.`,
          "info",
        );
        setCancelModalOpen(false);
        setAttendeeToCancel(null);

        if (selectedClassForAttendees) {
          await Promise.all([
            fetchAttendees(selectedClassForAttendees.scheduleId, selectedDate),
            fetchClasses(selectedDate),
          ]);
        }
      } else {
        toast.push(res.error || "No se pudo cancelar la reserva.", "danger");
      }
    } catch {
      toast.push("Error inesperado al cancelar reserva.", "danger");
    } finally {
      setCancelling(false);
    }
  };

  // Handle Manual Student Booking
  const handleManualBooking = async (scheduleId: string, studentId: string) => {
    setBookingLoading(true);
    try {
      const res = await adminManualBookClass(scheduleId, selectedDate, studentId);
      if (res.success) {
        toast.push("Alumno inscripto correctamente en la clase.", "success");
        setManualBookingOpen(false);

        if (selectedClassForAttendees) {
          await Promise.all([
            fetchAttendees(selectedClassForAttendees.scheduleId, selectedDate),
            fetchClasses(selectedDate),
          ]);
        } else {
          await fetchClasses(selectedDate);
        }
      } else {
        toast.push(res.error || "No se pudo realizar la inscripción.", "danger");
      }
    } catch {
      toast.push("Error inesperado al inscribir alumno.", "danger");
    } finally {
      setBookingLoading(false);
    }
  };

  // Handle Capacity Update
  const handleSaveCapacity = async (scheduleId: string, newCapacity: number | null) => {
    setSavingCapacity(true);
    try {
      const res = await updateScheduleCapacity(scheduleId, newCapacity);
      if (res.success) {
        toast.push("Cupo de la clase actualizado correctamente.", "success");
        setSelectedClassForCapacity(null);
        await fetchClasses(selectedDate);
      } else {
        toast.push(res.error || "No se pudo actualizar el cupo.", "danger");
      }
    } catch {
      toast.push("Error inesperado al modificar cupo.", "danger");
    } finally {
      setSavingCapacity(false);
    }
  };

  // Handle Schedule Management Modal Open
  const handleOpenScheduleManagement = async () => {
    setScheduleModalOpen(true);
    setLoadingScheduleModal(true);
    const { data } = await getAllClassTypesAndSchedules();
    setAllClassTypes(data);
    setLoadingScheduleModal(false);
  };

  // Quick Day Summary Metrics
  const daySummary = useMemo(() => {
    const totalClasses = classes.length;
    let totalCapacity = 0;
    let totalConfirmed = 0;
    let totalAttended = 0;
    let totalNoShow = 0;

    for (const c of classes) {
      if (c.capacity) totalCapacity += c.capacity;
      totalConfirmed += c.confirmedCount;
      totalAttended += c.attendedCount;
      totalNoShow += c.noShowCount;
    }

    const totalBooked = totalConfirmed + totalAttended;
    const occupancyPercent =
      totalCapacity > 0 ? Math.min(100, Math.round((totalBooked / totalCapacity) * 100)) : 0;

    return {
      totalClasses,
      totalCapacity,
      totalBooked,
      occupancyPercent,
      totalAttended,
      totalNoShow,
    };
  }, [classes]);

  const isToday = selectedDate === todayISO;

  return (
    <div className="space-y-7 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">
            Gestión de Clases y Reservas
          </h1>
          <p className="text-xs text-muted mt-0.5">
            Supervisá la ocupación en tiempo real, registrá asistencias y administrá cupos
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleOpenScheduleManagement}
            className="flex items-center gap-2 rounded-xl border border-border bg-card/80 px-3.5 py-2 text-xs font-semibold text-fg shadow-xs hover:border-white/20 hover:bg-card transition-all active:scale-95"
          >
            <Sliders size={14} className="text-accent" />
            <span>Gestionar Horarios</span>
          </button>

          <button
            type="button"
            onClick={() => fetchClasses(selectedDate)}
            title="Recargar datos"
            aria-label="Recargar datos"
            className="flex size-9 items-center justify-center rounded-xl border border-border bg-card/80 text-muted hover:text-fg hover:border-white/20 transition-colors"
          >
            <RefreshCw size={14} className={loadingClasses ? "animate-spin text-accent" : ""} />
          </button>
        </div>
      </div>

      {/* Date Navigation Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 rounded-2xl border border-border bg-surface/70 p-4">
        {/* Day Name Header */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-accent">
              {isToday ? "HOY" : "FECHA SELECCIONADA"}
            </span>
            <span className="text-muted text-xs">•</span>
            <span className="text-xs text-muted font-medium">Zona Horaria Argentina</span>
          </div>
          <h2 className="text-lg font-bold text-fg">
            {formatFullDateHeader(selectedDate)}
          </h2>
        </div>

        {/* Date Controls */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <button
            type="button"
            onClick={() => setSelectedDate(shiftDateDays(selectedDate, -1))}
            className="flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-muted hover:text-fg hover:border-white/20 transition-colors"
          >
            <ChevronLeft size={15} />
            <span className="hidden sm:inline">Día anterior</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedDate(todayISO)}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
              isToday
                ? "bg-accent-gradient text-white shadow-xs"
                : "border border-border bg-card text-muted hover:text-fg"
            }`}
          >
            HOY
          </button>

          <button
            type="button"
            onClick={() => setSelectedDate(shiftDateDays(selectedDate, 1))}
            className="flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-muted hover:text-fg hover:border-white/20 transition-colors"
          >
            <span className="hidden sm:inline">Día siguiente</span>
            <ChevronRight size={15} />
          </button>

          {/* Quick Date Input */}
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            className="rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {/* Pending Turno Requests */}
      <PendingEnrollmentsSection
        requests={pendingRequests}
        loading={loadingPendingRequests}
        onApprove={handleApproveEnrollment}
        onReject={handleRejectEnrollment}
      />

      {/* Active Turnos (collapsible) */}
      <ActiveEnrollmentsSection
        enrollments={activeEnrollments}
        loading={loadingActiveEnrollments}
        onCancel={handleCancelActiveEnrollment}
      />

      {/* Day Metrics Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border bg-card/60 p-4">
          <span className="text-xs text-faint block">Clases del Día</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-fg tnum">{daySummary.totalClasses}</span>
            <span className="text-xs text-muted">horarios activos</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/60 p-4">
          <span className="text-xs text-faint block">Total Reservas</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-accent tnum">{daySummary.totalBooked}</span>
            <span className="text-xs text-muted">/ {daySummary.totalCapacity || "—"} cupos</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/60 p-4">
          <span className="text-xs text-faint block">Ocupación General</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-fg tnum">{daySummary.occupancyPercent}%</span>
            <span className="text-xs text-muted">promedio</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/60 p-4">
          <span className="text-xs text-faint block">Asistencia Controlada</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-success tnum">{daySummary.totalAttended}</span>
            <span className="text-xs text-danger tnum font-semibold">({daySummary.totalNoShow} aus.)</span>
          </div>
        </div>
      </div>

      {/* Classes Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-faint">
            Horarios Programados ({classes.length})
          </h3>
        </div>

        {loadingClasses ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-56 animate-pulse rounded-2xl border border-border bg-card/40"
              />
            ))}
          </div>
        ) : classes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
            <CalendarCheck size={36} className="text-faint" />
            <div className="space-y-1">
              <h4 className="font-semibold text-fg text-base">No hay clases para este día</h4>
              <p className="text-xs text-muted max-w-sm">
                No hay actividades recurrentes programadas para este día de la semana. Podés consultar otros días con el selector.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDate(shiftDateDays(selectedDate, 1))}
              className="mt-2 text-xs font-semibold text-accent hover:underline"
            >
              Ver día siguiente →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((cls) => (
              <ClassCard
                key={cls.scheduleId}
                classItem={cls}
                onViewAttendees={handleOpenAttendees}
                onEditCapacity={(item) => setSelectedClassForCapacity(item)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 1. Modal: Attendees & Attendance Management */}
      <ClassAttendeesModal
        open={Boolean(selectedClassForAttendees)}
        classItem={selectedClassForAttendees}
        selectedDate={selectedDate}
        attendees={attendeesList}
        loading={loadingAttendees}
        onClose={() => setSelectedClassForAttendees(null)}
        onUpdateAttendance={handleUpdateAttendance}
        onCancelReservation={handleOpenCancelConfirmation}
        onOpenManualBooking={() => setManualBookingOpen(true)}
      />

      {/* 2. Modal: Edit Capacity */}
      <EditCapacityModal
        open={Boolean(selectedClassForCapacity)}
        classItem={selectedClassForCapacity}
        loading={savingCapacity}
        onClose={() => setSelectedClassForCapacity(null)}
        onSaveCapacity={handleSaveCapacity}
      />

      {/* 3. Modal: Manual Booking */}
      <ManualBookingModal
        open={manualBookingOpen}
        classItem={selectedClassForAttendees}
        selectedDate={selectedDate}
        loading={bookingLoading}
        onClose={() => setManualBookingOpen(false)}
        onConfirmBooking={(schedId, stdId) => handleManualBooking(schedId, stdId)}
      />

      {/* 4. Modal: Schedule & Activity Management */}
      <ScheduleManagementModal
        open={scheduleModalOpen}
        classTypes={allClassTypes}
        loading={loadingScheduleModal}
        onClose={() => setScheduleModalOpen(false)}
        onRefresh={async () => {
          const { data } = await getAllClassTypesAndSchedules();
          setAllClassTypes(data);
          await fetchClasses(selectedDate);
        }}
      />

      {/* 5. Modal: Confirm Cancellation */}
      <Modal
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="¿Cancelar Reserva de Alumno?"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-muted leading-relaxed">
            ¿Confirmás la cancelación de la reserva de{" "}
            <strong className="text-fg">{attendeeToCancel?.displayName}</strong>?
          </p>

          <div className="rounded-xl border border-border bg-surface/80 p-3 text-[11px] text-muted">
            El cupo quedará liberado inmediatamente para que otros alumnos puedan anotarse.
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              disabled={cancelling}
              onClick={() => setCancelModalOpen(false)}
              className="rounded-xl border border-border px-3.5 py-1.5 text-xs font-semibold text-muted hover:text-fg"
            >
              Volver
            </button>
            <button
              type="button"
              disabled={cancelling}
              onClick={handleConfirmCancelReservation}
              className="rounded-xl bg-danger px-4 py-1.5 text-xs font-semibold text-white hover:bg-danger/90 transition-colors"
            >
              {cancelling ? "Cancelando…" : "Confirmar Cancelación"}
            </button>
          </div>
        </div>
      </Modal>

      <ToastViewport />
    </div>
  );
}
