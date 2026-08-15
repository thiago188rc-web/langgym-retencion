import { createClient } from "@/lib/supabase/client";
import type { NormalizedStudent } from "@/lib/import/types";
import type { Student, ImportRecord } from "@/lib/types";
import { mapRowToStudent } from "./studentsService";

export interface SyncImportResult {
  nuevos: number;
  actualizados: number;
  sinCambios: number;
  bajas: number;
  permanecen: number;
  errores: number;
  total: number;
  importRecord: ImportRecord;
  syncedStudents: Student[];
}

/** Helper to slice arrays into manageable chunks */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export async function syncExcelImportToSupabase(
  organizationId: string,
  fileName: string,
  importedList: NormalizedStudent[],
): Promise<SyncImportResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. Fetch current students in DB to build lookup map by id_socio
  const { data: existingRows, error: fetchErr } = await supabase
    .from("students")
    .select("id, id_socio, nombre, apellido, telefono, habilitado, membresia, fecha_fin, ultima_asistencia")
    .eq("organization_id", organizationId);

  if (fetchErr) {
    throw new Error("No pudimos consultar los alumnos existentes en el servidor.");
  }

  const existingBySocio = new Map(existingRows?.map((r) => [r.id_socio, r]));
  const importedSocioSet = new Set<string>();

  let nuevosCount = 0;
  let actualizadosCount = 0;
  let sinCambiosCount = 0;
  let erroresCount = 0;

  const toInsert: Array<{
    organization_id: string;
    id_socio: string;
    nombre: string;
    apellido: string;
    nombre_completo: string;
    telefono: string | null;
    telefono_raw: string | null;
    email: string | null;
    habilitado: boolean;
    id_membresia: string | null;
    membresia: string | null;
    fecha_fin: string | null;
    fecha_alta: string | null;
    ultima_asistencia: string | null;
    observacion: string | null;
  }> = [];

  const toUpdate: Array<{
    id: string;
    data: {
      nombre: string;
      apellido: string;
      nombre_completo: string;
      telefono: string | null;
      telefono_raw: string | null;
      email: string | null;
      habilitado: boolean;
      id_membresia: string | null;
      membresia: string | null;
      fecha_fin: string | null;
      fecha_alta: string | null;
      ultima_asistencia: string | null;
      observacion: string | null;
    };
  }> = [];

  const snapshotInserts: Array<{
    organization_id: string;
    student_id: string;
    fecha: string;
    fecha_fin: string | null;
    ultima_asistencia: string | null;
    membresia: string | null;
    habilitado: boolean;
  }> = [];

  const todayIso = new Date().toISOString();

  for (const item of importedList) {
    if (!item.idSocio || !item.nombre) {
      erroresCount++;
      continue;
    }

    importedSocioSet.add(item.idSocio);
    const existing = existingBySocio.get(item.idSocio);

    if (!existing) {
      // Nuevo alumno
      nuevosCount++;
      toInsert.push({
        organization_id: organizationId,
        id_socio: item.idSocio,
        nombre: item.nombre,
        apellido: item.apellido || "",
        nombre_completo: item.nombreCompleto,
        telefono: item.telefono,
        telefono_raw: item.telefonoRaw,
        email: item.email,
        habilitado: item.habilitado,
        id_membresia: item.idMembresia,
        membresia: item.membresia,
        fecha_fin: item.fechaFin ? new Date(item.fechaFin).toISOString() : null,
        fecha_alta: item.fechaAlta ? new Date(item.fechaAlta).toISOString() : null,
        ultima_asistencia: item.ultimaAsistencia ? new Date(item.ultimaAsistencia).toISOString() : null,
        observacion: item.observacion,
      });
    } else {
      // Alumno que ya existía (Permanencia / Actualización)
      const finDate = item.fechaFin ? new Date(item.fechaFin).toISOString() : null;
      const asistDate = item.ultimaAsistencia ? new Date(item.ultimaAsistencia).toISOString() : null;

      const hasChanges =
        existing.nombre !== item.nombre ||
        existing.apellido !== (item.apellido || "") ||
        existing.telefono !== item.telefono ||
        existing.habilitado !== item.habilitado ||
        existing.membresia !== item.membresia ||
        (existing.fecha_fin ? existing.fecha_fin.slice(0, 10) : null) !== (item.fechaFin || null) ||
        (existing.ultima_asistencia ? existing.ultima_asistencia.slice(0, 10) : null) !== (item.ultimaAsistencia || null);

      if (hasChanges) {
        actualizadosCount++;
        toUpdate.push({
          id: existing.id,
          data: {
            nombre: item.nombre,
            apellido: item.apellido || "",
            nombre_completo: item.nombreCompleto,
            telefono: item.telefono,
            telefono_raw: item.telefonoRaw,
            email: item.email,
            habilitado: item.habilitado,
            id_membresia: item.idMembresia,
            membresia: item.membresia,
            fecha_fin: finDate,
            fecha_alta: item.fechaAlta ? new Date(item.fechaAlta).toISOString() : null,
            ultima_asistencia: asistDate,
            observacion: item.observacion,
          },
        });
      } else {
        sinCambiosCount++;
      }

      // Snapshot del estado actual en esta importación
      snapshotInserts.push({
        organization_id: organizationId,
        student_id: existing.id,
        fecha: todayIso,
        fecha_fin: finDate,
        ultima_asistencia: asistDate,
        membresia: item.membresia,
        habilitado: item.habilitado,
      });
    }
  }

  // Calculate bajas and permanentes
  const previousTotal = existingRows ? existingRows.length : 0;
  let bajasCount = 0;
  if (previousTotal > 0) {
    existingRows?.forEach((r) => {
      if (!importedSocioSet.has(r.id_socio)) {
        bajasCount++;
      }
    });
  }
  const permanecenCount = importedSocioSet.size - nuevosCount;

  // 2. Perform chunked batch insert for new students (100 per chunk)
  if (toInsert.length > 0) {
    const insertChunks = chunkArray(toInsert, 100);
    for (const chunk of insertChunks) {
      const { data: insertedStudents, error: insErr } = await supabase
        .from("students")
        .insert(chunk)
        .select("id, id_socio, fecha_fin, ultima_asistencia, membresia, habilitado");

      if (insErr) {
        throw new Error("Ocurrió un error al registrar los nuevos alumnos en el servidor.");
      }

      // Add initial snapshots for newly inserted students
      (insertedStudents || []).forEach((st) => {
        snapshotInserts.push({
          organization_id: organizationId,
          student_id: st.id,
          fecha: todayIso,
          fecha_fin: st.fecha_fin,
          ultima_asistencia: st.ultima_asistencia,
          membresia: st.membresia,
          habilitado: st.habilitado,
        });
      });
    }
  }

  // 3. Perform parallelized batch updates in concurrent batches of 15
  if (toUpdate.length > 0) {
    const updateBatches = chunkArray(toUpdate, 15);
    for (const batch of updateBatches) {
      await Promise.all(
        batch.map((upd) => supabase.from("students").update(upd.data).eq("id", upd.id)),
      );
    }
  }

  // 4. Batch insert snapshots in chunks of 100
  if (snapshotInserts.length > 0) {
    const snapChunks = chunkArray(snapshotInserts, 100);
    for (const chunk of snapChunks) {
      await supabase.from("snapshots").insert(chunk);
    }
  }

  // 5. Audit log in import_records
  const { data: importRecRow } = await supabase
    .from("import_records")
    .insert({
      organization_id: organizationId,
      user_id: user?.id ?? null,
      archivo: fileName,
      nuevos: nuevosCount,
      actualizados: actualizadosCount,
      bajas: bajasCount,
      permanecen: permanecenCount,
      errores: erroresCount,
      total: importedList.length,
      fecha: todayIso,
    })
    .select("*")
    .single();

  const importRecord: ImportRecord = {
    id: importRecRow?.id || `imp-${Date.now()}`,
    fecha: importRecRow?.fecha || todayIso,
    archivo: fileName,
    total: importedList.length,
    nuevos: nuevosCount,
    actualizados: actualizadosCount,
    sinCambios: sinCambiosCount,
    bajas: bajasCount,
    permanecen: permanecenCount,
    errores: erroresCount,
  };

  // 6. Reload full student list with preserved follow-ups and snapshots
  const { data: allFreshRows } = await supabase
    .from("students")
    .select("*")
    .eq("organization_id", organizationId)
    .order("nombre", { ascending: true });

  const { data: allFollowUps } = await supabase
    .from("follow_ups")
    .select("id, student_id, fecha, tipo, canal, mensaje, resultado")
    .eq("organization_id", organizationId);

  const { data: allSnapshots } = await supabase
    .from("snapshots")
    .select("id, student_id, fecha, fecha_fin, ultima_asistencia, membresia, habilitado")
    .eq("organization_id", organizationId);

  const fuByStudent: Record<string, any[]> = {};
  (allFollowUps || []).forEach((fu) => {
    if (!fuByStudent[fu.student_id]) fuByStudent[fu.student_id] = [];
    fuByStudent[fu.student_id].push(fu);
  });

  const snapByStudent: Record<string, any[]> = {};
  (allSnapshots || []).forEach((sn) => {
    if (!snapByStudent[sn.student_id]) snapByStudent[sn.student_id] = [];
    snapByStudent[sn.student_id].push(sn);
  });

  const syncedStudents = (allFreshRows || []).map((r) =>
    mapRowToStudent(r, fuByStudent[r.id] || [], snapByStudent[r.id] || []),
  );

  return {
    nuevos: nuevosCount,
    actualizados: actualizadosCount,
    sinCambios: sinCambiosCount,
    bajas: bajasCount,
    permanecen: permanecenCount,
    errores: erroresCount,
    total: importedList.length,
    importRecord,
    syncedStudents,
  };
}
