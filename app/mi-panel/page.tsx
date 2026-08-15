"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { isClientRole, isKnownRole, INCOMPLETE_PROFILE_ROUTE } from "@/lib/auth/roleRouting";
import { getArgentinaTodayISO } from "@/lib/dates";
import {
  getAvailableClassesForDate,
  getMyReservations,
  bookClass,
  cancelReservation,
  type AvailableClass,
  type UserReservationItem,
} from "@/lib/services/bookingService";
import { ClientHeader } from "@/components/client/ClientHeader";
import { DateSelector } from "@/components/client/DateSelector";
import { UpcomingReservations } from "@/components/client/UpcomingReservations";
import { AvailableClassesList } from "@/components/client/AvailableClassesList";
import { ProfileModal } from "@/components/client/ProfileModal";
import { CancelConfirmationModal } from "@/components/client/CancelConfirmationModal";
import { useToast, ToastViewport } from "@/components/ui/Toast";
import { Dumbbell } from "lucide-react";

export default function ClientPortalPage() {
  const { user, profile, organization, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [selectedDate, setSelectedDate] = useState<string>(getArgentinaTodayISO());
  const [upcomingReservations, setUpcomingReservations] = useState<UserReservationItem[]>([]);
  const [loadingReservations, setLoadingReservations] = useState(true);

  const [availableClasses, setAvailableClasses] = useState<AvailableClass[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);

  const [bookingScheduleId, setBookingScheduleId] = useState<string | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [reservationToCancel, setReservationToCancel] = useState<UserReservationItem | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const classesRef = useRef<HTMLDivElement>(null);

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

  // 2. Fetch user's upcoming reservations
  const fetchReservations = useCallback(async () => {
    setLoadingReservations(true);
    const { data, error } = await getMyReservations({ filter: "upcoming" });
    if (!error && data) {
      setUpcomingReservations(data);
    }
    setLoadingReservations(false);
  }, []);

  // 3. Fetch available classes for selected date
  const fetchClassesForDate = useCallback(async (dateISO: string) => {
    setLoadingClasses(true);
    const { data, error } = await getAvailableClassesForDate(dateISO);
    if (!error && data) {
      setAvailableClasses(data);
    } else if (error) {
      toast.push(error, "danger");
      setAvailableClasses([]);
    }
    setLoadingClasses(false);
  }, [toast]);

  // Initial load
  useEffect(() => {
    if (user && profile?.role === "cliente") {
      fetchReservations();
    }
  }, [user, profile, fetchReservations]);

  useEffect(() => {
    if (user && profile?.role === "cliente") {
      fetchClassesForDate(selectedDate);
    }
  }, [user, profile, selectedDate, fetchClassesForDate]);

  // 4. Booking Handler
  const handleBook = async (classItem: AvailableClass) => {
    setBookingScheduleId(classItem.scheduleId);

    try {
      const res = await bookClass(classItem.scheduleId, selectedDate);

      if (res.success) {
        toast.push(
          `¡Listo! Reservaste ${res.className || classItem.className} para las ${res.startTime || classItem.startTime} hs.`,
          "success",
        );
        // Refresh both list and active reservations
        await Promise.all([fetchReservations(), fetchClassesForDate(selectedDate)]);
      } else {
        // Concurrency / business logic feedback
        toast.push(res.error || "No se pudo realizar la reserva.", "danger");
        // Always refresh live availability
        await fetchClassesForDate(selectedDate);
      }
    } catch {
      toast.push("Ocurrió un error inesperado al conectar.", "danger");
      await fetchClassesForDate(selectedDate);
    } finally {
      setBookingScheduleId(null);
    }
  };

  // 5. Cancel Click from Upcoming Card
  const handleOpenCancelFromUpcoming = (res: UserReservationItem) => {
    setReservationToCancel(res);
    setCancelModalOpen(true);
  };

  // 6. Cancel Click from Available Class Card (already booked)
  const handleOpenCancelFromClass = (classItem: AvailableClass) => {
    const matching = upcomingReservations.find(
      (r) => r.classScheduleId === classItem.scheduleId && r.classDate === selectedDate,
    );
    if (matching) {
      setReservationToCancel(matching);
      setCancelModalOpen(true);
    } else {
      // Find or construct fallback
      const fallbackItem: UserReservationItem = {
        id: "",
        classScheduleId: classItem.scheduleId,
        classTypeId: classItem.classTypeId,
        className: classItem.className,
        classDescription: classItem.classDescription,
        classColor: classItem.classColor,
        classDate: selectedDate,
        startTime: classItem.startTime,
        endTime: classItem.endTime,
        status: "confirmed",
        createdAt: new Date().toISOString(),
        cancelledAt: null,
      };
      setReservationToCancel(fallbackItem);
      setCancelModalOpen(true);
    }
  };

  // 7. Execute Cancellation
  const handleConfirmCancel = async () => {
    if (!reservationToCancel) return;
    setCancelling(true);

    try {
      let targetReservationId = reservationToCancel.id;

      // If ID is missing, lookup from latest reservations
      if (!targetReservationId) {
        const { data } = await getMyReservations({ filter: "upcoming" });
        const found = data?.find(
          (r) =>
            r.classScheduleId === reservationToCancel.classScheduleId &&
            r.classDate === reservationToCancel.classDate,
        );
        if (found) targetReservationId = found.id;
      }

      if (!targetReservationId) {
        toast.push("No se encontró la reserva a cancelar.", "danger");
        setCancelModalOpen(false);
        setCancelling(false);
        return;
      }

      const res = await cancelReservation(targetReservationId);

      if (res.success) {
        toast.push("Reserva cancelada correctamente.", "info");
        setCancelModalOpen(false);
        setReservationToCancel(null);
        await Promise.all([fetchReservations(), fetchClassesForDate(selectedDate)]);
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
    classesRef.current?.scrollIntoView({ behavior: "smooth" });
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

        {/* 1. Upcoming active reservations */}
        <UpcomingReservations
          reservations={upcomingReservations}
          loading={loadingReservations}
          onCancelClick={handleOpenCancelFromUpcoming}
          onExploreClick={handleExploreClasses}
        />

        {/* 2. Date Picker */}
        <div ref={classesRef} className="pt-2">
          <DateSelector
            selectedDate={selectedDate}
            onSelectDate={(iso) => setSelectedDate(iso)}
          />
        </div>

        {/* 3. Available Classes List */}
        <AvailableClassesList
          selectedDate={selectedDate}
          classes={availableClasses}
          loading={loadingClasses}
          bookingScheduleId={bookingScheduleId}
          onBookClick={handleBook}
          onCancelReservedClick={handleOpenCancelFromClass}
        />
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
