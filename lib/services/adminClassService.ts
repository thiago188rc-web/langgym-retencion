// @ts-nocheck
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

export type ReservationStatus = Database["public"]["Tables"]["reservations"]["Row"]["status"];

export interface AdminClassItem {
  scheduleId: string;
  classTypeId: string;
  className: string;
  classDescription: string | null;
  classColor: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string | null;
  capacity: number | null;
  scheduleActive: boolean;
  classTypeActive: boolean;
  confirmedCount: number;
  attendedCount: number;
  noShowCount: number;
  cancelledCount: number;
  availableSpots: number | null;
  occupancyPercent: number | null;
  statusBadge: "DISPONIBLE" | "ULTIMOS_LUGARES" | "COMPLETA" | "SIN_CUPO" | "DESACTIVADA";
}

export interface ClassAttendee {
  reservationId: string;
  userId: string | null;
  studentId: string | null;
  status: ReservationStatus;
  createdAt: string;
  attendedAt: string | null;
  cancelledAt: string | null;
  notes: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  idSocio: string | null;
  membership: string | null;
}

export interface FullScheduleItem {
  id: string;
  classTypeId: string;
  className: string;
  classColor: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string | null;
  capacity: number | null;
  active: boolean;
}

export interface FullClassTypeItem {
  id: string;
  name: string;
  description: string | null;
  color: string;
  defaultCapacity: number | null;
  active: boolean;
  schedules: FullScheduleItem[];
}

/**
 * 1. Fetch all classes and booking metrics for an admin on a specific date
 */
export async function getAdminClassesForDate(
  dateISO: string,
): Promise<{ data: AdminClassItem[]; error: string | null }> {
  try {
    const supabase = createClient();

    const { data, error } = await supabase.rpc("get_admin_classes_for_date", {
      p_date: dateISO,
    });

    if (error) {
      console.error("Error fetching admin classes for date:", error);
      return { data: [], error: "No se pudieron cargar las clases del día." };
    }

    const items: AdminClassItem[] = (data || []).map((row) => {
      const confirmed = Number(row.confirmed_count) || 0;
      const attended = Number(row.attended_count) || 0;
      const totalBooked = confirmed + attended;
      const capacity = row.capacity != null ? Number(row.capacity) : null;
      const availableSpots = row.available_spots != null ? Number(row.available_spots) : null;

      let occupancyPercent: number | null = null;
      if (capacity && capacity > 0) {
        occupancyPercent = Math.min(100, Math.round((totalBooked / capacity) * 100));
      }

      let statusBadge: AdminClassItem["statusBadge"] = "DISPONIBLE";

      if (!row.schedule_active || !row.class_type_active) {
        statusBadge = "DESACTIVADA";
      } else if (capacity === null) {
        statusBadge = "SIN_CUPO";
      } else if (availableSpots === 0 || totalBooked >= capacity) {
        statusBadge = "COMPLETA";
      } else if (availableSpots !== null && availableSpots <= 3) {
        statusBadge = "ULTIMOS_LUGARES";
      }

      return {
        scheduleId: row.schedule_id,
        classTypeId: row.class_type_id,
        className: row.class_name,
        classDescription: row.class_description,
        classColor: row.class_color || "#22a058",
        dayOfWeek: row.day_of_week,
        startTime: (row.start_time || "").slice(0, 5),
        endTime: row.end_time ? row.end_time.slice(0, 5) : null,
        capacity,
        scheduleActive: row.schedule_active,
        classTypeActive: row.class_type_active,
        confirmedCount: confirmed,
        attendedCount: attended,
        noShowCount: Number(row.no_show_count) || 0,
        cancelledCount: Number(row.cancelled_count) || 0,
        availableSpots,
        occupancyPercent,
        statusBadge,
      };
    });

    return { data: items, error: null };
  } catch (err: any) {
    console.error("Unexpected error in getAdminClassesForDate:", err);
    return { data: [], error: "Error inesperado al consultar las clases." };
  }
}

/**
 * 2. Fetch attendees list for a specific schedule & date
 */
export async function getClassAttendees(
  scheduleId: string,
  dateISO: string,
): Promise<{ data: ClassAttendee[]; error: string | null }> {
  try {
    const supabase = createClient();

    const { data, error } = await supabase.rpc("get_class_attendees", {
      p_schedule_id: scheduleId,
      p_class_date: dateISO,
    });

    if (error) {
      console.error("Error fetching class attendees:", error);
      return { data: [], error: "No se pudo obtener la lista de alumnos inscriptos." };
    }

    const attendees: ClassAttendee[] = (data || []).map((row) => {
      const displayName =
        row.student_nombre ||
        row.profile_full_name ||
        row.profile_email ||
        "Alumno sin nombre";

      const phone = row.student_telefono || row.profile_phone || null;
      const email = row.profile_email || null;

      return {
        reservationId: row.reservation_id,
        userId: row.user_id,
        studentId: row.student_id,
        status: row.status as ReservationStatus,
        createdAt: row.created_at,
        attendedAt: row.attended_at,
        cancelledAt: row.cancelled_at,
        notes: row.notes,
        displayName,
        email,
        phone,
        idSocio: row.student_id_socio,
        membership: row.student_membresia,
      };
    });

    return { data: attendees, error: null };
  } catch (err: any) {
    console.error("Unexpected error in getClassAttendees:", err);
    return { data: [], error: "Error inesperado al consultar inscriptos." };
  }
}

/**
 * 3. Update reservation attendance (Presente, Ausente, Restablecer)
 */
export async function updateReservationAttendance(
  reservationId: string,
  status: "attended" | "no_show" | "confirmed",
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = createClient();

    const { data: res, error } = await supabase.rpc("admin_update_attendance", {
      p_reservation_id: reservationId,
      p_status: status,
    });

    if (error) {
      console.error("Error updating attendance:", error);
      return { success: false, error: error.message || "No se pudo actualizar la asistencia." };
    }

    const parsed = res as { success: boolean; error?: string };
    if (!parsed.success) {
      return { success: false, error: parsed.error || "No se pudo actualizar la asistencia." };
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error("Unexpected error in updateReservationAttendance:", err);
    return { success: false, error: "Error inesperado al registrar asistencia." };
  }
}

/**
 * 4. Cancel a reservation from admin panel
 */
export async function adminCancelReservation(
  reservationId: string,
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = createClient();

    const { data: res, error } = await supabase.rpc("admin_update_attendance", {
      p_reservation_id: reservationId,
      p_status: "cancelled",
    });

    if (error) {
      console.error("Error cancelling reservation:", error);
      return { success: false, error: error.message || "No se pudo cancelar la reserva." };
    }

    const parsed = res as { success: boolean; error?: string };
    if (!parsed.success) {
      return { success: false, error: parsed.error || "No se pudo cancelar la reserva." };
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error("Unexpected error in adminCancelReservation:", err);
    return { success: false, error: "Error inesperado al cancelar la reserva." };
  }
}

/**
 * 5. Admin manual booking with atomic capacity check
 */
export async function adminManualBookClass(
  scheduleId: string,
  dateISO: string,
  studentId: string,
): Promise<{ success: boolean; alreadyBooked?: boolean; message?: string; error: string | null }> {
  try {
    const supabase = createClient();

    const { data: res, error } = await supabase.rpc("admin_manual_book_class", {
      p_schedule_id: scheduleId,
      p_class_date: dateISO,
      p_user_id: null,
      p_student_id: studentId,
    });

    if (error) {
      console.error("Error in admin_manual_book_class:", error);
      return { success: false, error: error.message || "No se pudo reservar el lugar." };
    }

    const parsed = res as { success: boolean; already_booked?: boolean; message?: string; error?: string };
    if (!parsed.success) {
      return { success: false, error: parsed.error || "Cupo completo o error al reservar." };
    }

    if (parsed.already_booked) {
      return {
        success: true,
        alreadyBooked: true,
        message: parsed.message || "El alumno ya se encuentra anotado en este turno.",
        error: null,
      };
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error("Unexpected error in adminManualBookClass:", err);
    return { success: false, error: "Error inesperado al agregar el alumno." };
  }
}

/**
 * 6. Update schedule capacity
 */
export async function updateScheduleCapacity(
  scheduleId: string,
  newCapacity: number | null,
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = createClient();

    const { data: res, error } = await supabase.rpc("admin_update_schedule_capacity", {
      p_schedule_id: scheduleId,
      p_capacity: newCapacity,
    });

    if (error) {
      console.error("Error updating schedule capacity:", error);
      return { success: false, error: error.message || "No se pudo modificar el cupo." };
    }

    const parsed = res as { success: boolean; error?: string };
    if (!parsed.success) {
      return { success: false, error: parsed.error || "No se pudo modificar el cupo." };
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error("Unexpected error in updateScheduleCapacity:", err);
    return { success: false, error: "Error inesperado al guardar el cupo." };
  }
}

/**
 * 7. Toggle schedule active status
 */
export async function toggleScheduleActive(
  scheduleId: string,
  active: boolean,
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = createClient();

    const { error } = await supabase
      .from("class_schedules")
      .update({ active, updated_at: new Date().toISOString() })
      .eq("id", scheduleId);

    if (error) {
      console.error("Error toggling schedule active:", error);
      return { success: false, error: "No se pudo actualizar el estado del horario." };
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error("Unexpected error in toggleScheduleActive:", err);
    return { success: false, error: "Error inesperado al cambiar estado." };
  }
}

/**
 * 8. Fetch all class types and schedules for the full management drawer
 */
export async function getAllClassTypesAndSchedules(): Promise<{
  data: FullClassTypeItem[];
  error: string | null;
}> {
  try {
    const supabase = createClient();

    const { data: types, error: typesError } = await supabase
      .from("class_types")
      .select("id, name, description, color, default_capacity, active")
      .order("name", { ascending: true });

    if (typesError) {
      console.error("Error fetching class types:", typesError);
      return { data: [], error: "No se pudieron obtener las actividades." };
    }

    const { data: schedules, error: schedError } = await supabase
      .from("class_schedules")
      .select("id, class_type_id, day_of_week, start_time, end_time, capacity, active")
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true });

    if (schedError) {
      console.error("Error fetching schedules:", schedError);
      return { data: [], error: "No se pudieron obtener los horarios." };
    }

    const fullList: FullClassTypeItem[] = (types || []).map((t) => {
      const matchedSchedules: FullScheduleItem[] = (schedules || [])
        .filter((s) => s.class_type_id === t.id)
        .map((s) => ({
          id: s.id,
          classTypeId: s.class_type_id,
          className: t.name,
          classColor: t.color || "#22a058",
          dayOfWeek: s.day_of_week,
          startTime: (s.start_time || "").slice(0, 5),
          endTime: s.end_time ? s.end_time.slice(0, 5) : null,
          capacity: s.capacity,
          active: s.active,
        }));

      return {
        id: t.id,
        name: t.name,
        description: t.description,
        color: t.color || "#22a058",
        defaultCapacity: t.default_capacity,
        active: t.active,
        schedules: matchedSchedules,
      };
    });

    return { data: fullList, error: null };
  } catch (err: any) {
    console.error("Unexpected error in getAllClassTypesAndSchedules:", err);
    return { data: [], error: "Error inesperado al cargar la configuración de clases." };
  }
}

/**
 * 9. Auto-sync / self-healing: Ensure Yoga Deportivo and Friday 19:00 schedule exist in Supabase
 */
export async function ensureYogaDeportivoScheduleExists(): Promise<{
  created: boolean;
  error: string | null;
}> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { created: false, error: null };

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) return { created: false, error: null };
    const orgId = profile.organization_id;

    // 1. Check or insert class_type 'Yoga Deportivo'
    const { data: existingTypes } = await supabase
      .from("class_types")
      .select("id, name, active")
      .eq("organization_id", orgId);

    let yogaTypeId: string | null = null;
    const foundYogaDep = (existingTypes || []).find(
      (t) => t.name.trim().toLowerCase() === "yoga deportivo"
    );

    if (foundYogaDep) {
      yogaTypeId = foundYogaDep.id;
      if (!foundYogaDep.active) {
        await supabase
          .from("class_types")
          .update({ active: true })
          .eq("id", yogaTypeId);
      }
    } else {
      const { data: newType, error: insTypeError } = await supabase
        .from("class_types")
        .insert({
          organization_id: orgId,
          name: "Yoga Deportivo",
          description: "Conexión cuerpo, mente y entrenamiento físico.",
          color: "#a855f7",
          default_capacity: 15,
          active: true,
        })
        .select("id")
        .single();

      if (!insTypeError && newType) {
        yogaTypeId = newType.id;
      }
    }

    if (!yogaTypeId) {
      return { created: false, error: "No se pudo asegurar la actividad Yoga Deportivo." };
    }

    // 2. Check or insert class_schedules for Friday (5) at 19:00
    const { data: existingSchedules } = await supabase
      .from("class_schedules")
      .select("id, start_time, active, class_type_id")
      .eq("organization_id", orgId)
      .eq("day_of_week", 5);

    const hasYogaFriday19 = (existingSchedules || []).some(
      (s) => s.class_type_id === yogaTypeId && (s.start_time || "").startsWith("19:00")
    );

    let createdSchedule = false;
    if (!hasYogaFriday19) {
      const { error: insSchedError } = await supabase.from("class_schedules").insert({
        organization_id: orgId,
        class_type_id: yogaTypeId,
        day_of_week: 5,
        start_time: "19:00:00",
        capacity: 15,
        active: true,
      });
      if (!insSchedError) {
        createdSchedule = true;
      }
    }

    // 3. If a generic 'Yoga' schedule at Friday 19:00 exists, deactivate it
    const plainYoga = (existingTypes || []).find(
      (t) => t.name.trim().toLowerCase() === "yoga" && t.id !== yogaTypeId
    );
    if (plainYoga) {
      const plainYogaSched = (existingSchedules || []).find(
        (s) => s.class_type_id === plainYoga.id && (s.start_time || "").startsWith("19:00")
      );
      if (plainYogaSched) {
        await supabase
          .from("class_schedules")
          .update({ active: false })
          .eq("id", plainYogaSched.id);
      }
    }

    return { created: createdSchedule || !foundYogaDep, error: null };
  } catch (err: any) {
    console.error("Error in ensureYogaDeportivoScheduleExists:", err);
    return { created: false, error: err.message || "Error al verificar horarios" };
  }
}

/**
 * 10. Create a new class schedule
 */
export async function createClassSchedule(params: {
  classTypeId: string;
  dayOfWeek: number;
  startTime: string;
  endTime?: string | null;
  capacity?: number | null;
}): Promise<{ success: boolean; data?: any; error: string | null }> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "No autenticado" };

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return { success: false, error: "No se encontró la organización." };
    }

    const formattedStart = params.startTime.length === 5 ? `${params.startTime}:00` : params.startTime;
    const formattedEnd = params.endTime
      ? params.endTime.length === 5
        ? `${params.endTime}:00`
        : params.endTime
      : null;

    const { data, error } = await supabase
      .from("class_schedules")
      .insert({
        organization_id: profile.organization_id,
        class_type_id: params.classTypeId,
        day_of_week: params.dayOfWeek,
        start_time: formattedStart,
        end_time: formattedEnd,
        capacity: params.capacity ?? 15,
        active: true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating class schedule:", error);
      return { success: false, error: error.message || "No se pudo crear el horario." };
    }

    return { success: true, data, error: null };
  } catch (err: any) {
    console.error("Unexpected error in createClassSchedule:", err);
    return { success: false, error: "Error inesperado al crear el horario." };
  }
}

/**
 * 11. Create a new class type
 */
export async function createClassType(params: {
  name: string;
  description?: string;
  color?: string;
  defaultCapacity?: number | null;
}): Promise<{ success: boolean; data?: any; error: string | null }> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "No autenticado" };

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return { success: false, error: "No se encontró la organización." };
    }

    const { data, error } = await supabase
      .from("class_types")
      .insert({
        organization_id: profile.organization_id,
        name: params.name.trim(),
        description: params.description?.trim() || null,
        color: params.color || "#a855f7",
        default_capacity: params.defaultCapacity ?? 15,
        active: true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating class type:", error);
      return { success: false, error: error.message || "No se pudo crear la actividad." };
    }

    return { success: true, data, error: null };
  } catch (err: any) {
    console.error("Unexpected error in createClassType:", err);
    return { success: false, error: "Error inesperado al crear la actividad." };
  }
}

/**
 * 12. Delete a class schedule
 */
export async function deleteClassSchedule(
  scheduleId: string,
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = createClient();
    const { error } = await supabase.from("class_schedules").delete().eq("id", scheduleId);
    if (error) {
      console.error("Error deleting class schedule:", error);
      return { success: false, error: error.message || "No se pudo eliminar el horario." };
    }
    return { success: true, error: null };
  } catch (err: any) {
    console.error("Unexpected error in deleteClassSchedule:", err);
    return { success: false, error: "Error inesperado al eliminar el horario." };
  }
}

