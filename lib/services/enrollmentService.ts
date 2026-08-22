import { createClient } from "@/lib/supabase/client";
import type { EnrollmentStatus } from "@/lib/supabase/types";

export interface AvailableSchedule {
  scheduleId: string;
  classTypeId: string;
  className: string;
  classDescription: string | null;
  classColor: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string | null;
  capacity: number | null;
  activeEnrollments: number;
  availableSpots: number | null;
  isFull: boolean;
  isPendingCapacity: boolean;
}

export interface MyEnrollment {
  id: string;
  status: EnrollmentStatus;
  classScheduleId: string;
  className: string;
  classColor: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string | null;
  requestedAt: string;
  decidedAt: string | null;
  decisionNotes: string | null;
}

export interface EnrollmentActionResponse {
  success: boolean;
  error?: string;
  enrollmentId?: string;
  count?: number;
}

const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function dayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] ?? "";
}

function parseEnrollmentError(rawError: string | null | undefined): string {
  if (!rawError) return "Ocurrió un error inesperado al procesar la solicitud.";
  const err = rawError.toLowerCase();

  if (err.includes("no estás autenticado")) return "Debés iniciar sesión para solicitar un turno.";
  if (err.includes("ya anotaste tus horarios")) return "Ya anotaste tus horarios semanales. Para modificarlos, pedile el cambio al staff por WhatsApp.";
  if (err.includes("elegí al menos un horario")) return "Elegí al menos un horario antes de confirmar.";
  if (err.includes("ya no está disponible") || err.includes("no está disponible")) return "Uno de los horarios seleccionados ya no está disponible. Volvé a intentarlo.";
  if (err.includes("temporalmente inactiva")) return "Una de las actividades seleccionadas se encuentra temporalmente inactiva.";
  if (err.includes("no se encontró el perfil")) return "No se encontró tu perfil de usuario.";

  return rawError;
}

/** 1. List schedules a client can request a turno for, with live occupancy. */
export async function getAvailableClassSchedules(): Promise<{ data: AvailableSchedule[]; error: string | null }> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_available_class_schedules");

    if (error) {
      console.error("Error fetching available schedules:", error);
      return { data: [], error: "No se pudieron cargar los horarios disponibles." };
    }

    const items: AvailableSchedule[] = (data || []).map((row) => {
      const capacity = row.capacity != null ? Number(row.capacity) : null;
      const active = Number(row.active_enrollments || 0);
      const isFull = capacity != null && active >= capacity;

      return {
        scheduleId: row.schedule_id,
        classTypeId: row.class_type_id,
        className: row.class_name,
        classDescription: row.class_description,
        classColor: row.class_color || "#22a058",
        dayOfWeek: Number(row.day_of_week),
        startTime: String(row.start_time).slice(0, 5),
        endTime: row.end_time ? String(row.end_time).slice(0, 5) : null,
        capacity,
        activeEnrollments: active,
        availableSpots: row.available_spots != null ? Number(row.available_spots) : null,
        isFull,
        isPendingCapacity: capacity == null,
      };
    });

    return { data: items, error: null };
  } catch (err: any) {
    console.error("Unexpected error in getAvailableClassSchedules:", err);
    return { data: [], error: "Error inesperado al cargar los horarios." };
  }
}

/** 2. Fetch ALL of the authenticated client's enrollments (a client can now have several: one per weekly day). */
export async function getMyEnrollments(): Promise<{ data: MyEnrollment[]; error: string | null }> {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("class_enrollments")
      .select(
        `
        id,
        status,
        class_schedule_id,
        requested_at,
        decided_at,
        decision_notes,
        class_types ( name, color ),
        class_schedules ( day_of_week, start_time, end_time )
      `,
      )
      .in("status", ["pending", "active"])
      .order("requested_at", { ascending: true });

    if (error) {
      console.error("Error fetching my enrollments:", error);
      return { data: [], error: "No se pudo consultar tus turnos." };
    }

    const items: MyEnrollment[] = (data || []).map((row: any) => ({
      id: row.id,
      status: row.status as EnrollmentStatus,
      classScheduleId: row.class_schedule_id,
      className: row.class_types?.name || "Clase",
      classColor: row.class_types?.color || "#22a058",
      dayOfWeek: Number(row.class_schedules?.day_of_week ?? 0),
      startTime: row.class_schedules?.start_time ? String(row.class_schedules.start_time).slice(0, 5) : "—",
      endTime: row.class_schedules?.end_time ? String(row.class_schedules.end_time).slice(0, 5) : null,
      requestedAt: row.requested_at,
      decidedAt: row.decided_at,
      decisionNotes: row.decision_notes,
    }));

    // Días de la semana primero (Lunes..Sábado, Domingo al final), luego por horario.
    items.sort((a, b) => {
      const da = a.dayOfWeek === 0 ? 7 : a.dayOfWeek;
      const db = b.dayOfWeek === 0 ? 7 : b.dayOfWeek;
      if (da !== db) return da - db;
      return a.startTime.localeCompare(b.startTime);
    });

    return { data: items, error: null };
  } catch (err: any) {
    console.error("Unexpected error in getMyEnrollments:", err);
    return { data: [], error: "Error inesperado al consultar tus turnos." };
  }
}

/**
 * 3. Request the client's fixed weekly schedule, ALL AT ONCE and BY ONLY ONCE:
 * creates one 'pending' enrollment per selected day/time, awaiting owner approval.
 * Blocked forever after the first successful call (see request_class_enrollments_bulk).
 */
export async function requestClassEnrollments(scheduleIds: string[]): Promise<EnrollmentActionResponse> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("request_class_enrollments_bulk", {
      p_schedule_ids: scheduleIds,
    });

    if (error) {
      return { success: false, error: parseEnrollmentError(error.message) };
    }

    const res = data as any;
    if (res && res.success === false) {
      return { success: false, error: parseEnrollmentError(res.error) };
    }

    return { success: true, count: res?.count };
  } catch (err: any) {
    console.error("Unexpected error in requestClassEnrollments:", err);
    return { success: false, error: "Ocurrió un error al enviar tu solicitud. Por favor reintentá." };
  }
}

/** 4. Cancel a still-pending request (before the owner reviews it). */
export async function cancelMyEnrollmentRequest(enrollmentId: string): Promise<EnrollmentActionResponse> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("cancel_my_enrollment_request", {
      p_enrollment_id: enrollmentId,
    });

    if (error) {
      return { success: false, error: parseEnrollmentError(error.message) };
    }

    const res = data as any;
    if (res && res.success === false) {
      return { success: false, error: parseEnrollmentError(res.error) };
    }

    return { success: true };
  } catch (err: any) {
    console.error("Unexpected error in cancelMyEnrollmentRequest:", err);
    return { success: false, error: "No se pudo cancelar la solicitud." };
  }
}

/** Build a wa.me link to the gym owner asking for a turno change, pre-filled with context (may list several days). */
export function buildTurnoChangeWhatsappLink(
  ownerWhatsapp: string | null | undefined,
  studentName: string,
  currentTurnos: { className: string; dayOfWeek: number; startTime: string }[],
): string | null {
  if (!ownerWhatsapp) return null;
  const sanitizedPhone = ownerWhatsapp.replace(/[^\d]/g, "");
  if (!sanitizedPhone) return null;

  const turnoText =
    currentTurnos.length > 0
      ? currentTurnos
          .map((t) => `${t.className} los ${dayName(t.dayOfWeek)} a las ${t.startTime}`)
          .join(", ")
      : "mis turnos";

  const message = `Hola! Soy ${studentName}. Tengo anotados estos horarios: ${turnoText}. Quisiera solicitar un cambio. ¿Me ayudás? 🙏`;

  return `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(message)}`;
}
