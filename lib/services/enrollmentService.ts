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
}

const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function dayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] ?? "";
}

function parseEnrollmentError(rawError: string | null | undefined): string {
  if (!rawError) return "Ocurrió un error inesperado al procesar la solicitud.";
  const err = rawError.toLowerCase();

  if (err.includes("no estás autenticado")) return "Debés iniciar sesión para solicitar un turno.";
  if (err.includes("solicitud de turno pendiente")) return "Ya tenés una solicitud de turno pendiente de aprobación.";
  if (err.includes("turno activo")) return "Ya tenés un turno activo. Para cambiarlo, pedile el cambio al staff por WhatsApp.";
  if (err.includes("no existe o no se encuentra activo")) return "El horario seleccionado ya no está disponible.";
  if (err.includes("no está habilitada")) return "Esta actividad se encuentra temporalmente inactiva.";
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

/** 2. Fetch the authenticated client's latest enrollment (pending/active/rejected/cancelled). */
export async function getMyEnrollment(): Promise<{ data: MyEnrollment | null; error: string | null }> {
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
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching my enrollment:", error);
      return { data: null, error: "No se pudo consultar tu turno." };
    }

    if (!data) return { data: null, error: null };

    const row = data as any;
    return {
      data: {
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
      },
      error: null,
    };
  } catch (err: any) {
    console.error("Unexpected error in getMyEnrollment:", err);
    return { data: null, error: "Error inesperado al consultar tu turno." };
  }
}

/** 3. Request a fixed weekly turno (creates a 'pending' enrollment awaiting owner approval). */
export async function requestClassEnrollment(scheduleId: string): Promise<EnrollmentActionResponse> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("request_class_enrollment", { p_schedule_id: scheduleId });

    if (error) {
      return { success: false, error: parseEnrollmentError(error.message) };
    }

    const res = data as any;
    if (res && res.success === false) {
      return { success: false, error: parseEnrollmentError(res.error) };
    }

    return { success: true, enrollmentId: res?.enrollment_id };
  } catch (err: any) {
    console.error("Unexpected error in requestClassEnrollment:", err);
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

/** Build a wa.me link to the gym owner asking for a turno change, pre-filled with context. */
export function buildTurnoChangeWhatsappLink(
  ownerWhatsapp: string | null | undefined,
  studentName: string,
  currentTurno: { className: string; dayOfWeek: number; startTime: string } | null,
): string | null {
  if (!ownerWhatsapp) return null;
  const sanitizedPhone = ownerWhatsapp.replace(/[^\d]/g, "");
  if (!sanitizedPhone) return null;

  const turnoText = currentTurno
    ? `${currentTurno.className} los ${dayName(currentTurno.dayOfWeek)} a las ${currentTurno.startTime}`
    : "mi turno";

  const message = `Hola! Soy ${studentName}. Tengo el turno de ${turnoText} y quisiera solicitar un cambio de horario. ¿Me ayudás? 🙏`;

  return `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(message)}`;
}
