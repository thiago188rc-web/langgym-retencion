import { createClient } from "@/lib/supabase/client";
import type { Database, ReservationStatus } from "@/lib/supabase/types";
import { getArgentinaTodayISO } from "@/lib/dates";

export interface AvailableClass {
  scheduleId: string;
  classTypeId: string;
  className: string;
  classDescription: string | null;
  classColor: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string | null;
  capacity: number | null;
  confirmedReservations: number;
  availableSpots: number | null;
  isUserReserved: boolean;
  statusText: string;
  isFull: boolean;
  isPendingCapacity: boolean;
}

export interface UserReservationItem {
  id: string;
  classScheduleId: string;
  classTypeId: string;
  className: string;
  classDescription: string | null;
  classColor: string;
  classDate: string;
  startTime: string;
  endTime: string | null;
  status: ReservationStatus;
  createdAt: string;
  cancelledAt: string | null;
}

export interface AdminReservationItem {
  id: string;
  classDate: string;
  status: ReservationStatus;
  createdAt: string;
  cancelledAt: string | null;
  attendedAt: string | null;
  notes: string | null;
  user: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
  };
  student: {
    id: string;
    idSocio: string;
    nombreCompleto: string;
    telefono: string | null;
    membresia: string | null;
    habilitado: boolean;
  } | null;
}

export interface BookingResponse {
  success: boolean;
  reservationId?: string;
  className?: string;
  startTime?: string;
  classDate?: string;
  spotsLeft?: number;
  error?: string;
  errorCode?: string;
}

/**
 * Maps raw database / RPC errors into user-friendly Spanish explanations.
 */
function parseBookingError(rawError: string | null | undefined): { message: string; code: string } {
  if (!rawError) {
    return { message: "Ocurrió un error inesperado al procesar la solicitud.", code: "UNKNOWN_ERROR" };
  }

  const err = rawError.toLowerCase();

  if (err.includes("no estás autenticado") || err.includes("unauthenticated")) {
    return { message: "Debés iniciar sesión para reservar una clase.", code: "UNAUTHENTICATED" };
  }
  if (err.includes("perfil no encontrado") || err.includes("no se encontró el perfil")) {
    return { message: "No se encontró el perfil de usuario registrado.", code: "PROFILE_NOT_FOUND" };
  }
  if (err.includes("cupo completo") || err.includes("no quedan lugares")) {
    return { message: "Cupo completo. No quedan lugares disponibles para este horario.", code: "CAPACITY_FULL" };
  }
  if (err.includes("ya tenés una reserva") || err.includes("unique_active_reservation_slot")) {
    return { message: "Ya tenés una reserva confirmada para este horario.", code: "ALREADY_RESERVED" };
  }
  if (err.includes("no tiene cupo definido")) {
    return { message: "Esta clase aún no tiene cupo definido por el gimnasio.", code: "CAPACITY_NOT_SET" };
  }
  if (err.includes("no corresponde al día") || err.includes("día en que se dicta")) {
    return { message: "La fecha seleccionada no corresponde al día de esta actividad.", code: "INVALID_SCHEDULE_DAY" };
  }
  if (err.includes("fechas pasadas")) {
    return { message: "No es posible reservar clases para fechas pasadas.", code: "PAST_DATE" };
  }
  if (err.includes("no existe o no se encuentra activo")) {
    return { message: "El horario seleccionado no existe o fue cancelado.", code: "SCHEDULE_NOT_FOUND" };
  }
  if (err.includes("no está habilitada")) {
    return { message: "Esta actividad se encuentra temporalmente inactiva.", code: "CLASS_INACTIVE" };
  }
  if (err.includes("no tenés permisos")) {
    return { message: "No tenés permiso para realizar esta acción.", code: "UNAUTHORIZED" };
  }

  return { message: rawError, code: "DATABASE_ERROR" };
}

/**
 * 1. Get available classes and current spot status for a concrete date (YYYY-MM-DD)
 */
export async function getAvailableClassesForDate(dateISO: string): Promise<{ data: AvailableClass[]; error: string | null }> {
  try {
    const supabase = createClient();
    const cleanDate = dateISO.slice(0, 10);

    const { data, error } = await supabase.rpc("get_available_classes_for_date", {
      p_date: cleanDate,
    });

    if (error) {
      console.error("Error fetching available classes:", error);
      const parsed = parseBookingError(error.message);
      return { data: [], error: parsed.message };
    }

    if (!data || !Array.isArray(data)) {
      return { data: [], error: null };
    }

    const classes: AvailableClass[] = data.map((item: any) => {
      const capacity = item.capacity as number | null;
      const confirmed = Number(item.confirmed_reservations || 0);
      const isFull = capacity != null && confirmed >= capacity;
      const isPending = capacity == null;
      const spots = capacity != null ? Math.max(0, capacity - confirmed) : null;

      let statusText = "";
      if (isPending) {
        statusText = "Cupo a confirmar";
      } else if (isFull) {
        statusText = "Cupo Completo";
      } else if (spots === 1) {
        statusText = "¡Último lugar disponible!";
      } else {
        statusText = `${spots} de ${capacity} lugares disponibles`;
      }

      return {
        scheduleId: item.schedule_id,
        classTypeId: item.class_type_id,
        className: item.class_name,
        classDescription: item.class_description || null,
        classColor: item.class_color || "#22a058",
        dayOfWeek: Number(item.day_of_week),
        startTime: String(item.start_time).slice(0, 5),
        endTime: item.end_time ? String(item.end_time).slice(0, 5) : null,
        capacity: capacity,
        confirmedReservations: confirmed,
        availableSpots: spots,
        isUserReserved: Boolean(item.is_user_reserved),
        statusText,
        isFull,
        isPendingCapacity: isPending,
      };
    });

    return { data: classes, error: null };
  } catch (err: any) {
    console.error("Unexpected error in getAvailableClassesForDate:", err);
    return { data: [], error: "No se pudieron cargar las clases del día. Intente nuevamente." };
  }
}

/**
 * 2. Book a class atomically using PostgreSQL RPC `book_class`
 */
export async function bookClass(scheduleId: string, classDateISO: string): Promise<BookingResponse> {
  try {
    const supabase = createClient();
    const cleanDate = classDateISO.slice(0, 10);

    const { data, error } = await supabase.rpc("book_class", {
      p_schedule_id: scheduleId,
      p_class_date: cleanDate,
    });

    if (error) {
      const parsed = parseBookingError(error.message);
      return { success: false, error: parsed.message, errorCode: parsed.code };
    }

    const res = data as any;
    if (res && res.success === false) {
      const parsed = parseBookingError(res.error);
      return { success: false, error: parsed.message, errorCode: parsed.code };
    }

    return {
      success: true,
      reservationId: res?.reservation_id,
      className: res?.class_name,
      startTime: res?.start_time ? String(res.start_time).slice(0, 5) : undefined,
      classDate: res?.class_date,
      spotsLeft: res?.spots_left,
    };
  } catch (err: any) {
    console.error("Unexpected error in bookClass:", err);
    return {
      success: false,
      error: "Ocurrió un error al procesar tu reserva. Por favor reintentá.",
      errorCode: "UNEXPECTED_ERROR",
    };
  }
}

/**
 * 3. Cancel a reservation using PostgreSQL RPC `cancel_reservation`
 */
export async function cancelReservation(reservationId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = createClient();

    const { data, error } = await supabase.rpc("cancel_reservation", {
      p_reservation_id: reservationId,
    });

    if (error) {
      const parsed = parseBookingError(error.message);
      return { success: false, error: parsed.message };
    }

    const res = data as any;
    if (res && res.success === false) {
      const parsed = parseBookingError(res.error);
      return { success: false, error: parsed.message };
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error("Unexpected error in cancelReservation:", err);
    return { success: false, error: "No se pudo cancelar la reserva. Por favor reintentá." };
  }
}

/**
 * 4. Get authenticated user's reservations (RLS enforces user_id = auth.uid())
 */
export async function getMyReservations(options?: {
  filter?: "upcoming" | "past" | "all";
}): Promise<{ data: UserReservationItem[]; error: string | null }> {
  try {
    const supabase = createClient();
    const today = getArgentinaTodayISO();

    let query = supabase
      .from("reservations")
      .select(`
        id,
        class_schedule_id,
        class_type_id,
        class_date,
        status,
        created_at,
        cancelled_at,
        class_types (
          name,
          description,
          color
        ),
        class_schedules (
          start_time,
          end_time
        )
      `)
      .order("class_date", { ascending: options?.filter !== "past" })
      .order("created_at", { ascending: false });

    if (options?.filter === "upcoming") {
      query = query.gte("class_date", today).eq("status", "confirmed");
    } else if (options?.filter === "past") {
      query = query.or(`class_date.lt.${today},status.neq.confirmed`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching my reservations:", error);
      return { data: [], error: parseBookingError(error.message).message };
    }

    if (!data || !Array.isArray(data)) {
      return { data: [], error: null };
    }

    const list: UserReservationItem[] = data.map((item: any) => ({
      id: item.id,
      classScheduleId: item.class_schedule_id,
      classTypeId: item.class_type_id,
      className: item.class_types?.name || "Clase",
      classDescription: item.class_types?.description || null,
      classColor: item.class_types?.color || "#22a058",
      classDate: item.class_date,
      startTime: item.class_schedules?.start_time ? String(item.class_schedules.start_time).slice(0, 5) : "—",
      endTime: item.class_schedules?.end_time ? String(item.class_schedules.end_time).slice(0, 5) : null,
      status: item.status as ReservationStatus,
      createdAt: item.created_at,
      cancelledAt: item.cancelled_at,
    }));

    return { data: list, error: null };
  } catch (err: any) {
    console.error("Unexpected error in getMyReservations:", err);
    return { data: [], error: "No se pudieron cargar tus reservas." };
  }
}

/**
 * 5. Get reservations for a specific schedule & date (Staff / Admin view)
 */
export async function getAdminReservationsForSchedule(
  scheduleId: string,
  classDateISO: string,
): Promise<{ data: AdminReservationItem[]; error: string | null }> {
  try {
    const supabase = createClient();
    const cleanDate = classDateISO.slice(0, 10);

    const { data, error } = await supabase
      .from("reservations")
      .select(`
        id,
        class_date,
        status,
        created_at,
        cancelled_at,
        attended_at,
        notes,
        profiles (
          id,
          full_name,
          email,
          phone
        ),
        students (
          id,
          id_socio,
          nombre_completo,
          telefono,
          membresia,
          habilitado
        )
      `)
      .eq("class_schedule_id", scheduleId)
      .eq("class_date", cleanDate)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching admin reservations:", error);
      return { data: [], error: parseBookingError(error.message).message };
    }

    if (!data || !Array.isArray(data)) {
      return { data: [], error: null };
    }

    const items: AdminReservationItem[] = data.map((item: any) => ({
      id: item.id,
      classDate: item.class_date,
      status: item.status as ReservationStatus,
      createdAt: item.created_at,
      cancelledAt: item.cancelled_at,
      attendedAt: item.attended_at,
      notes: item.notes,
      user: {
        id: item.profiles?.id || "",
        fullName: item.profiles?.full_name || "Sin nombre",
        email: item.profiles?.email || "",
        phone: item.profiles?.phone || null,
      },
      student: item.students
        ? {
            id: item.students.id,
            idSocio: item.students.id_socio,
            nombreCompleto: item.students.nombre_completo,
            telefono: item.students.telefono,
            membresia: item.students.membresia,
            habilitado: item.students.habilitado,
          }
        : null,
    }));

    return { data: items, error: null };
  } catch (err: any) {
    console.error("Unexpected error in getAdminReservationsForSchedule:", err);
    return { data: [], error: "No se pudieron cargar los inscriptos." };
  }
}

/**
 * 6. Admin updates reservation status (e.g. mark attended, no_show, cancelled)
 */
export async function adminUpdateReservationStatus(
  reservationId: string,
  status: ReservationStatus,
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = createClient();

    // 1. Try atomic PostgreSQL RPC with server-side validation & timezone timestamps
    const { data: rpcRes, error: rpcErr } = await supabase.rpc("admin_update_attendance", {
      p_reservation_id: reservationId,
      p_status: status,
    });

    if (!rpcErr && rpcRes) {
      const parsed = rpcRes as { success: boolean; error?: string };
      if (!parsed.success) {
        return { success: false, error: parsed.error || "No se pudo actualizar el estado." };
      }
      return { success: true, error: null };
    }

    // 2. Direct table update fallback
    const updatePayload: Record<string, any> = { status };
    if (status === "attended") {
      updatePayload.attended_at = new Date().toISOString();
    } else if (status === "cancelled") {
      updatePayload.cancelled_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("reservations")
      .update(updatePayload)
      .eq("id", reservationId);

    if (error) {
      console.error("Error updating reservation status:", error);
      return { success: false, error: parseBookingError(error.message).message };
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error("Unexpected error in adminUpdateReservationStatus:", err);
    return { success: false, error: "No se pudo actualizar el estado de la reserva." };
  }
}
