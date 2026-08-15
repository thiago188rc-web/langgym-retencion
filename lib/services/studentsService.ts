import { createClient } from "@/lib/supabase/client";
import type { Student } from "@/lib/types";
import type { Database } from "@/lib/supabase/types";

type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type StudentInsert = Database["public"]["Tables"]["students"]["Insert"];
type FollowUpRow = Pick<
  Database["public"]["Tables"]["follow_ups"]["Row"],
  "id" | "student_id" | "fecha" | "tipo" | "canal" | "mensaje" | "resultado"
>;
type SnapshotRow = Pick<
  Database["public"]["Tables"]["snapshots"]["Row"],
  "id" | "student_id" | "fecha" | "fecha_fin" | "ultima_asistencia" | "membresia" | "habilitado"
>;

export function mapRowToStudent(
  row: StudentRow,
  followUps: FollowUpRow[] = [],
  snapshots: SnapshotRow[] = [],
): Student {
  return {
    id: row.id,
    idSocio: row.id_socio,
    nombre: row.nombre,
    apellido: row.apellido || "",
    nombreCompleto: row.nombre_completo,
    telefono: row.telefono,
    telefonoRaw: row.telefono_raw,
    email: row.email,
    habilitado: row.habilitado,
    idMembresia: row.id_membresia,
    membresia: row.membresia,
    fechaFin: row.fecha_fin ? row.fecha_fin.slice(0, 10) : null,
    fechaAlta: row.fecha_alta ? row.fecha_alta.slice(0, 10) : null,
    ultimaAsistencia: row.ultima_asistencia ? row.ultima_asistencia.slice(0, 10) : null,
    observacion: row.observacion,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    snapshots: snapshots.map((s) => ({
      fecha: s.fecha.slice(0, 10),
      fechaFin: s.fecha_fin ? s.fecha_fin.slice(0, 10) : null,
      ultimaAsistencia: s.ultima_asistencia ? s.ultima_asistencia.slice(0, 10) : null,
      membresia: s.membresia,
      habilitado: s.habilitado,
    })),
    followUps: followUps.map((f) => ({
      id: f.id,
      fecha: f.fecha,
      tipo: f.tipo,
      canal: f.canal,
      mensaje: f.mensaje,
      resultado: f.resultado,
    })),
  };
}

export function mapStudentToInsert(student: Student, organizationId: string): StudentInsert {
  return {
    id: student.id && student.id.length === 36 ? student.id : undefined,
    organization_id: organizationId,
    id_socio: student.idSocio,
    nombre: student.nombre,
    apellido: student.apellido || "",
    nombre_completo: student.nombreCompleto,
    telefono: student.telefono,
    telefono_raw: student.telefonoRaw,
    email: student.email,
    habilitado: student.habilitado,
    id_membresia: student.idMembresia,
    membresia: student.membresia,
    fecha_fin: student.fechaFin ? new Date(student.fechaFin).toISOString() : null,
    fecha_alta: student.fechaAlta ? new Date(student.fechaAlta).toISOString() : null,
    ultima_asistencia: student.ultimaAsistencia ? new Date(student.ultimaAsistencia).toISOString() : null,
    observacion: student.observacion,
  };
}

export async function fetchStudentsFromSupabase(organizationId: string): Promise<Student[]> {
  const supabase = createClient();

  // 1. Fetch all students for the organization with explicit column selection
  const { data: studentRows, error: sErr } = await supabase
    .from("students")
    .select(
      "id, organization_id, id_socio, nombre, apellido, nombre_completo, telefono, telefono_raw, email, habilitado, id_membresia, membresia, fecha_fin, fecha_alta, ultima_asistencia, observacion, created_at, updated_at",
    )
    .eq("organization_id", organizationId)
    .order("nombre", { ascending: true });

  if (sErr || !studentRows) {
    throw new Error("No se pudieron cargar los alumnos desde el servidor.");
  }

  // 2. Fetch all follow-ups for the organization with selective fields
  const { data: followUpRows } = await supabase
    .from("follow_ups")
    .select("id, student_id, fecha, tipo, canal, mensaje, resultado")
    .eq("organization_id", organizationId)
    .order("fecha", { ascending: false });

  // 3. Fetch snapshots with selective fields
  const { data: snapshotRows } = await supabase
    .from("snapshots")
    .select("id, student_id, fecha, fecha_fin, ultima_asistencia, membresia, habilitado")
    .eq("organization_id", organizationId)
    .order("fecha", { ascending: false });

  const fuByStudent: Record<string, FollowUpRow[]> = {};
  (followUpRows || []).forEach((fu) => {
    if (!fuByStudent[fu.student_id]) fuByStudent[fu.student_id] = [];
    fuByStudent[fu.student_id].push(fu);
  });

  const snapByStudent: Record<string, SnapshotRow[]> = {};
  (snapshotRows || []).forEach((snap) => {
    if (!snapByStudent[snap.student_id]) snapByStudent[snap.student_id] = [];
    snapByStudent[snap.student_id].push(snap);
  });

  return studentRows.map((row) =>
    mapRowToStudent(row, fuByStudent[row.id] || [], snapByStudent[row.id] || []),
  );
}
