import { createClient } from "@/lib/supabase/client";

export interface RosterEntry {
  enrollmentId: string;
  name: string;
  phone: string | null;
  status: "pending" | "active" | "rejected" | "cancelled";
}

export interface ClassRosterGroup {
  scheduleId: string;
  classTypeId: string;
  className: string;
  classColor: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string | null;
  capacity: number | null;
  roster: RosterEntry[];
}

/**
 * Active class schedules for the org, each with who's currently signed up
 * (pending/active turno) — name and phone only, no billing/risk data.
 *
 * Source is strictly the REGISTERED ACCOUNTS (profiles) that picked a turno.
 * The Excel padrón (`students`) is a separate circuit that feeds the admin
 * retention/cobros panel and is deliberately NOT read here.
 */
export async function getProfessorClassRoster(): Promise<{
  data: ClassRosterGroup[];
  error: string | null;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_professor_class_roster");

    if (error) {
      console.error("Error fetching professor roster:", error);
      return { data: [], error: "No se pudieron cargar las actividades." };
    }

    const groups = new Map<string, ClassRosterGroup>();
    for (const row of data || []) {
      let group = groups.get(row.class_schedule_id);
      if (!group) {
        group = {
          scheduleId: row.class_schedule_id,
          classTypeId: row.class_type_id,
          className: row.class_name,
          classColor: row.class_color,
          dayOfWeek: row.day_of_week,
          startTime: row.start_time,
          endTime: row.end_time,
          capacity: row.capacity,
          roster: [],
        };
        groups.set(row.class_schedule_id, group);
      }
      if (row.enrollment_id && row.enrolled_name) {
        group.roster.push({
          enrollmentId: row.enrollment_id,
          name: row.enrolled_name,
          phone: row.enrolled_phone,
          status: row.enrollment_status as RosterEntry["status"],
        });
      }
    }

    return { data: Array.from(groups.values()), error: null };
  } catch (err: any) {
    console.error("Unexpected error in getProfessorClassRoster:", err);
    return { data: [], error: "Ocurrió un error al consultar las actividades." };
  }
}

/** How a student's attendance stands for one class on one date. */
export type AttendanceStatus = "confirmed" | "attended" | "no_show" | "cancelled";

export interface DayAttendee {
  userId: string;
  name: string;
  phone: string | null;
  reservationId: string | null;
  status: AttendanceStatus;
}

export interface DayClass {
  scheduleId: string;
  classTypeId: string;
  className: string;
  classColor: string | null;
  startTime: string;
  endTime: string | null;
  capacity: number | null;
  attendees: DayAttendee[];
}

/**
 * Attendance sheet for one date: the classes running that day and who is
 * expected — again, only registered accounts with an active turno.
 */
export async function getProfessorDayRoster(
  dateISO: string,
): Promise<{ data: DayClass[]; error: string | null }> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_professor_day_roster", { p_date: dateISO });

    if (error) {
      console.error("Error fetching day roster:", error);
      return { data: [], error: "No se pudo cargar la lista del día." };
    }

    const classes = new Map<string, DayClass>();
    for (const row of data || []) {
      let cls = classes.get(row.class_schedule_id);
      if (!cls) {
        cls = {
          scheduleId: row.class_schedule_id,
          classTypeId: row.class_type_id,
          className: row.class_name,
          classColor: row.class_color,
          startTime: row.start_time,
          endTime: row.end_time,
          capacity: row.capacity,
          attendees: [],
        };
        classes.set(row.class_schedule_id, cls);
      }
      if (row.user_id) {
        cls.attendees.push({
          userId: row.user_id,
          name: row.attendee_name || "Alumno sin nombre",
          phone: row.attendee_phone,
          reservationId: row.reservation_id,
          status: (row.attendance_status || "confirmed") as AttendanceStatus,
        });
      }
    }

    return { data: Array.from(classes.values()), error: null };
  } catch (err: any) {
    console.error("Unexpected error in getProfessorDayRoster:", err);
    return { data: [], error: "Ocurrió un error al consultar la lista del día." };
  }
}

/** Mark a student present / absent / unmarked for one class on one date. */
export async function markAttendance(
  scheduleId: string,
  dateISO: string,
  userId: string,
  status: "attended" | "no_show" | "confirmed",
): Promise<{ success: boolean; error: string | null }> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("professor_mark_attendance", {
      p_schedule_id: scheduleId,
      p_class_date: dateISO,
      p_user_id: userId,
      p_status: status,
    });

    if (error) {
      console.error("Error marking attendance:", error);
      return { success: false, error: "No se pudo guardar la asistencia." };
    }

    const parsed = data as { success: boolean; error?: string };
    if (!parsed?.success) {
      return { success: false, error: parsed?.error || "No se pudo guardar la asistencia." };
    }
    return { success: true, error: null };
  } catch (err: any) {
    console.error("Unexpected error in markAttendance:", err);
    return { success: false, error: "Ocurrió un error al guardar la asistencia." };
  }
}
