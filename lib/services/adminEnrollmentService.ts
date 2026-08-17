import { createClient } from "@/lib/supabase/client";

export interface PendingEnrollmentRequest {
  enrollmentId: string;
  userId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  studentId: string | null;
  idSocio: string | null;
  studentLinked: boolean;
  membershipActive: boolean | null;
  membershipEndsAt: string | null;
  classScheduleId: string;
  classTypeId: string;
  className: string;
  classColor: string;
  dayOfWeek: number;
  startTime: string;
  requestedAt: string;
}

export interface EnrollmentDecisionResponse {
  success: boolean;
  error?: string;
  reservationsGenerated?: number;
  weeksSkippedFull?: number;
  reservationsCancelled?: number;
}

/** 1. List pending turno requests (Staff/Admin/Owner), with student/payment context. */
export async function getPendingEnrollmentRequests(): Promise<{
  data: PendingEnrollmentRequest[];
  error: string | null;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_pending_enrollment_requests");

    if (error) {
      console.error("Error fetching pending enrollment requests:", error);
      return { data: [], error: "No se pudieron cargar las solicitudes de turno." };
    }

    const now = Date.now();
    const items: PendingEnrollmentRequest[] = (data || []).map((row) => {
      const membershipEndsAt = row.student_fecha_fin;
      const membershipActive = row.student_id
        ? Boolean(row.student_habilitado) && (!membershipEndsAt || new Date(membershipEndsAt).getTime() >= now)
        : null;

      return {
        enrollmentId: row.enrollment_id,
        userId: row.user_id,
        displayName: row.student_nombre_completo || row.profile_full_name || row.profile_email || "Alumno",
        email: row.profile_email,
        phone: row.profile_phone,
        studentId: row.student_id,
        idSocio: row.student_id_socio,
        studentLinked: Boolean(row.student_id),
        membershipActive,
        membershipEndsAt,
        classScheduleId: row.class_schedule_id,
        classTypeId: row.class_type_id,
        className: row.class_name,
        classColor: row.class_color || "#22a058",
        dayOfWeek: Number(row.day_of_week),
        startTime: String(row.start_time).slice(0, 5),
        requestedAt: row.requested_at,
      };
    });

    return { data: items, error: null };
  } catch (err: any) {
    console.error("Unexpected error in getPendingEnrollmentRequests:", err);
    return { data: [], error: "Error inesperado al cargar las solicitudes." };
  }
}

/** 2. Approve a pending request: confirms the turno and generates upcoming reservations. */
export async function approveClassEnrollment(enrollmentId: string): Promise<EnrollmentDecisionResponse> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("approve_class_enrollment", {
      p_enrollment_id: enrollmentId,
    });

    if (error) {
      console.error("Error approving enrollment:", error);
      return { success: false, error: error.message || "No se pudo aprobar la solicitud." };
    }

    const res = data as any;
    if (!res?.success) {
      return { success: false, error: res?.error || "No se pudo aprobar la solicitud." };
    }

    return {
      success: true,
      reservationsGenerated: res.reservations_generated,
      weeksSkippedFull: res.weeks_skipped_full,
    };
  } catch (err: any) {
    console.error("Unexpected error in approveClassEnrollment:", err);
    return { success: false, error: "Error inesperado al aprobar la solicitud." };
  }
}

/** 3. Reject a pending request. */
export async function rejectClassEnrollment(
  enrollmentId: string,
  reason?: string,
): Promise<EnrollmentDecisionResponse> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("reject_class_enrollment", {
      p_enrollment_id: enrollmentId,
      p_reason: reason || null,
    });

    if (error) {
      console.error("Error rejecting enrollment:", error);
      return { success: false, error: error.message || "No se pudo rechazar la solicitud." };
    }

    const res = data as any;
    if (!res?.success) {
      return { success: false, error: res?.error || "No se pudo rechazar la solicitud." };
    }

    return { success: true };
  } catch (err: any) {
    console.error("Unexpected error in rejectClassEnrollment:", err);
    return { success: false, error: "Error inesperado al rechazar la solicitud." };
  }
}

export interface ActiveEnrollment {
  enrollmentId: string;
  userId: string;
  displayName: string;
  phone: string | null;
  idSocio: string | null;
  classScheduleId: string;
  className: string;
  classColor: string;
  dayOfWeek: number;
  startTime: string;
  decidedAt: string | null;
}

/** 4. List currently active turnos (Staff/Admin/Owner) — to free one up on request. */
export async function getActiveEnrollments(): Promise<{ data: ActiveEnrollment[]; error: string | null }> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_active_enrollments");

    if (error) {
      console.error("Error fetching active enrollments:", error);
      return { data: [], error: "No se pudieron cargar los turnos activos." };
    }

    const items: ActiveEnrollment[] = (data || []).map((row) => ({
      enrollmentId: row.enrollment_id,
      userId: row.user_id,
      displayName: row.profile_full_name || "Alumno",
      phone: row.profile_phone,
      idSocio: row.student_id_socio,
      classScheduleId: row.class_schedule_id,
      className: row.class_name,
      classColor: row.class_color || "#22a058",
      dayOfWeek: Number(row.day_of_week),
      startTime: String(row.start_time).slice(0, 5),
      decidedAt: row.decided_at,
    }));

    return { data: items, error: null };
  } catch (err: any) {
    console.error("Unexpected error in getActiveEnrollments:", err);
    return { data: [], error: "Error inesperado al cargar los turnos activos." };
  }
}

/** 5. Cancel an already-active turno (e.g. student requested a change via WhatsApp). */
export async function cancelClassEnrollment(enrollmentId: string): Promise<EnrollmentDecisionResponse> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("cancel_class_enrollment", {
      p_enrollment_id: enrollmentId,
    });

    if (error) {
      console.error("Error cancelling enrollment:", error);
      return { success: false, error: error.message || "No se pudo cancelar el turno." };
    }

    const res = data as any;
    if (!res?.success) {
      return { success: false, error: res?.error || "No se pudo cancelar el turno." };
    }

    return { success: true, reservationsCancelled: res.reservations_cancelled };
  } catch (err: any) {
    console.error("Unexpected error in cancelClassEnrollment:", err);
    return { success: false, error: "Error inesperado al cancelar el turno." };
  }
}
