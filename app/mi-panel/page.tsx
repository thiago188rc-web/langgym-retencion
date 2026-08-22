"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { isClientRole, isKnownRole, INCOMPLETE_PROFILE_ROUTE } from "@/lib/auth/roleRouting";
import {
  getMyReservations,
  cancelReservation,
  type UserReservationItem,
} from "@/lib/services/bookingService";
import {
  getAvailableClassSchedules,
  getMyEnrollments,
  requestClassEnrollments,
  cancelMyEnrollmentRequest,
  buildTurnoChangeWhatsappLink,
  type AvailableSchedule,
  type MyEnrollment,
} from "@/lib/services/enrollmentService";
import { ClientHeader } from "@/components/client/ClientHeader";
import { UpcomingReservations } from "@/components/client/UpcomingReservations";
import { TurnoStatusCard } from "@/components/client/TurnoStatusCard";
import { TurnoRequestList } from "@/components/client/TurnoRequestList";
import { ProfileModal } from "@/components/client/ProfileModal";
import { CancelConfirmationModal } from "@/components/client/CancelConfirmationModal";
import { useToast, ToastViewport } from "@/components/ui/Toast";
import { Dumbbell } from "lucide-react";

export default function ClientPortalPage() {
  const { user, profile, organization, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [upcomingReservations, setUpcomingReservations] = useState<UserReservationItem[]>([]);
  const [loadingReservations, setLoadingReservations] = useState(true);

  const [myEnrollments, setMyEnrollments] = useState<MyEnrollment[]>([]);
  const [loadingEnrollment, setLoadingEnrollment] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [availableSchedules, setAvailableSchedules] = useState<AvailableSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [reservationToCancel, setReservationToCancel] = useState<UserReservationItem | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const turnoSectionRef = useRef<HTMLDivElement>(null);

  // 1. Guard against unauthenticated, admin, or incomplete-profile access.
  // This portal must only render for a profile explicitly known to be
  // "cliente" — never as a default for missing/unrecognized roles.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
    } else if (isClientRole(profile?.role)) {
      // ok, stays
    } else if (isKnownRole(profile?.role)) {
      router.replace("/");
    } else if (profile) {
      // Profile loaded but role is missing/unrecognized -> controlled state.
      router.replace(INCOMPLETE_PROFILE_ROUTE);
    }
    // profile === null while a user is present and loading is false means
    // the profile fetch hasn't resolved a row yet; middleware will already
    // route these cases, so we avoid redirecting on every transient null.
  }, [authLoading, user, profile, router]);

  // 2. Fetch user's upcoming (already-approved) reservations
  const fetchReservations = useCallback(async () => {
    setLoadingReservations(true);
    const { data, error } = await getMyReservations({ filter: "upcoming" });
    if (!error && data) {
      setUpcomingReservations(data);
    }
    setLoadingReservations(false);
  }, []);

  // 3. Fetch the client's current turno requests/assignments (can be several: one per day)
  const fetchEnrollments = useCallback(async () => {
    setLoadingEnrollment(true);
    const { data } = await getMyEnrollments();
    setMyEnrollments(data);
    setLoadingEnrollment(false);
  }, []);

  // 4. Fetch schedules available to request a turno for
  const fetchSchedules = useCallback(async () => {
    setLoadingSchedules(true);
    const { data, error } = await getAvailableClassSchedules();
    if (error) toast.push(error, "danger");
    setAvailableSchedules(data);
    setLoadingSchedules(false);
  }, [toast]);

  // Initial load
  useEffect(() => {
    if (user && profile?.role === "cliente") {
      fetchReservations();
      fetchEnrollments();
    }
  }, [user, profile, fetchReservations, fetchEnrollments]);

  // Only load the schedule picker once we know the client has no active/pending turno yet
  useEffect(() => {
    if (user && profile?.role === "cliente" && !loadingEnrollment && myEnrollments.length === 0) {
      fetchSchedules();
    }
  }, [user, profile, loadingEnrollment, myEnrollments, fetchSchedules]);

  // 5. Confirm the weekly schedule selection — by only once (see request_class_enrollments_bulk)
  const handleConfirmSchedules = async (scheduleIds: string[]) => {
    if (scheduleIds.length === 0) return;
    setSubmittingRequest(true);
    try {
      const res = await requestClassEnrollments(scheduleIds);
      if (res.success) {
        toast.push("¡Horarios anotados! Te avisamos cuando el staff confirme tu pago.", "success");
        await fetchEnrollments();
      } else {
        toast.push(res.error || "No se pudo enviar la solicitud.", "danger");
      }
    } catch {
      toast.push("Ocurrió un error inesperado al conectar.", "danger");
    } finally {
      setSubmittingRequest(false);
    }
  };

  // 6. Cancel a still-pending turno request
  const handleCancelRequest = async (enrollmentId: string) => {
    setCancellingId(enrollmentId);
    try {
      const res = await cancelMyEnrollmentRequest(enrollmentId);
      if (res.success) {
        toast.push("Solicitud cancelada.", "info");
        await fetchEnrollments();
        await fetchSchedules();
      } else {
        toast.push(res.error || "No se pudo cancelar la solicitud.", "danger");
      }
    } finally {
      setCancellingId(null);
    }
  };

  // 7. Cancel Click from Upcoming Card
  const handleOpenCancelFromUpcoming = (res: UserReservationItem) => {
    setReservationToCancel(res);
    setCancelModalOpen(true);
  };

  // 8. Execute Cancellation of a single scheduled occurrence
  const handleConfirmCancel = async () => {
    if (!reservationToCancel) return;
    setCancelling(true);

    try {
      const res = await cancelReservation(reservationToCancel.id);

      if (res.success) {
        toast.push("Reserva cancelada correctamente.", "info");
        setCancelModalOpen(false);
        setReservationToCancel(null);
        await fetchReservations();
      } else {
        toast.push(res.error || "No se pudo cancelar la reserva.", "danger");
      }
    } catch {
      toast.push("Error inesperado al cancelar.", "danger");
    } finally {
      setCancelling(false);
    }
  };

  const handleExploreClasses = () => {
    turnoSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  if (authLoading || !profile) {
    return (
      <div className="flex h-dvh items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-12 animate-pulse items-center justify-center rounded-2xl bg-accent-gradient glow-accent">
            <Dumbbell size={24} className="text-white" />
          </div>
          <span className="text-sm text-faint">Cargando tus clases…</span>
        </div>
      </div>
    );
  }

  const displayName = profile.full_name || "Alumno";
  const activeEnrollments = myEnrollments.filter((e) => e.status === "active");
  const whatsappLink = buildTurnoChangeWhatsappLink(
    organization?.owner_whatsapp,
    displayName,
    activeEnrollments.map((e) => ({
      className: e.className,
      dayOfWeek: e.dayOfWeek,
      startTime: e.startTime,
    })),
  );

  return (
    <div className="min-h-dvh bg-bg text-fg pb-16">
      {/* Top Header */}
      <ClientHeader
        organizationName={organization?.name || "Lang Gym"}
        displayName={displayName}
        onOpenProfile={() => setProfileModalOpen(true)}
        onSignOut={() => signOut()}
      />

      {/* Main Content Area */}
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 space-y-7">
        {/* Welcome Section */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-fg">
              Hola, {displayName.split(" ")[0]} 👋
            </h1>
            <p className="text-xs text-muted mt-0.5">
              Consultá los horarios y reservá tu lugar en el gimnasio
            </p>
          </div>
        </div>

        {/* Unlinked info banner if student_id is null */}
        {!profile.student_id && (
          <div className="flex items-start gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4 text-xs text-sky-200">
            <div className="flex size-7 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 shrink-0">
              <Dumbbell size={15} />
            </div>
            <div className="space-y-0.5 min-w-0">
              <span className="font-semibold text-fg block">Cuenta lista para reservas</span>
              <p className="text-muted text-[12px] leading-relaxed">
                El staff de {organization?.name || "Lang Gym"} asociará tu cuenta con tu ficha de socio en tu próxima visita o renovación de pase.
              </p>
            </div>
          </div>
        )}

        {/* 1. Upcoming approved class dates */}
        <UpcomingReservations
          reservations={upcomingReservations}
          loading={loadingReservations}
          onCancelClick={handleOpenCancelFromUpcoming}
          onExploreClick={handleExploreClasses}
        />

        {/* 2. Turno status (pending/active) or request picker */}
        <div ref={turnoSectionRef} className="pt-2">
          {loadingEnrollment ? (
            <div className="rounded-2xl border border-border bg-card/40 p-8 flex justify-center items-center">
              <span className="text-xs text-muted animate-pulse">Consultando tu turno…</span>
            </div>
          ) : myEnrollments.length > 0 ? (
            <TurnoStatusCard
              enrollments={myEnrollments}
              whatsappLink={whatsappLink}
              cancellingId={cancellingId}
              onCancelRequest={handleCancelRequest}
            />
          ) : (
            <TurnoRequestList
              schedules={availableSchedules}
              loading={loadingSchedules}
              submitting={submittingRequest}
              onConfirm={handleConfirmSchedules}
            />
          )}
        </div>
      </main>

      {/* Modals & Portals */}
      <ProfileModal
        profile={profile}
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
      />

      <CancelConfirmationModal
        reservation={reservationToCancel}
        open={cancelModalOpen}
        loading={cancelling}
        onClose={() => setCancelModalOpen(false)}
        onConfirm={handleConfirmCancel}
      />

      <ToastViewport />
    </div>
  );
}
