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
