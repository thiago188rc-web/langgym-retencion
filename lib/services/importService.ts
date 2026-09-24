// @ts-nocheck
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/supabase/fetchAll";
import type { NormalizedStudent } from "@/lib/import/types";
import type { Student, ImportRecord, CanonicalField } from "@/lib/types";
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
  /**
   * Canonical fields the source file actually had a recognized column for
   * (result.mapping.byField from parseExcel). Any optional field NOT in this
   * set means "this import has no information about it" — for students that
   * already exist, that value must be PRESERVED, never overwritten with
   * null. Without this, re-importing a file that's missing (or fails to
   * recognize) e.g. the vencimiento column would silently wipe every
   * existing student's real fecha_fin.
   */
  presentFields: Set<CanonicalField> = new Set([
    "idSocio",
    "nombre",
    "habilitado",
    "idMembresia",
    "membresia",
    "fechaFin",
    "fechaAlta",
    "ultimaAsistencia",
    "email",
    "telefono",
    "celular",
    "observacion",
  ]),
  onProgress?: (step: string, pct?: number) => void,
  customSupabaseClient?: any,
): Promise<SyncImportResult> {
  const supabase = customSupabaseClient || createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. Fetch ALL current students in DB to build lookup map by id_socio
  // (paginated — a single request caps at 1000 rows; without this, every
  // student past the first page silently looked "new" on reimport, tripping
  // the unique id_socio constraint or duplicating snapshots for real people).
  let existingRows: Array<{
    id: string;
    id_socio: string;
    nombre: string;
    apellido: string | null;
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
  }>;
  try {
    existingRows = await fetchAllRows(() =>
      supabase
        .from("students")
        .select(
          "id, id_socio, nombre, apellido, telefono, telefono_raw, email, habilitado, id_membresia, membresia, fecha_fin, fecha_alta, ultima_asistencia, observacion",
        )
        .eq("organization_id", organizationId)
        // Unique sort key: without it the paged reads below can repeat or skip
        // rows, which here would mean re-inserting an existing socio as "nuevo".
        .order("id", { ascending: true }),
    );
  } catch {
    throw new Error("No pudimos consultar los alumnos existentes en el servidor.");
  }

  const existingBySocio = new Map(existingRows.map((r) => [r.id_socio, r]));
  const existingByPhone = new Map<string, (typeof existingRows)[0]>();
  const existingByName = new Map<string, (typeof existingRows)[0]>();

  for (const r of existingRows) {
    if (r.telefono) {
      const d = r.telefono.replace(/\D/g, "");
      if (d.length >= 7) existingByPhone.set(d, r);
    }
    if (r.telefono_raw) {
      const d = r.telefono_raw.replace(/\D/g, "");
      if (d.length >= 7) existingByPhone.set(d, r);
    }
    const nameKey = `${r.nombre || ""} ${r.apellido || ""}`.trim().toLowerCase();
    if (nameKey) existingByName.set(nameKey, r);
  }

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

  // Students matched this import but had nothing to change — still part of
  // "this import", so they still need last_import_id stamped, just without
  // rewriting every other field.
  const unchangedIds: string[] = [];

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
    if (!item.nombre && !item.nombreCompleto) {
      erroresCount++;
      continue;
    }

    const cleanDigits = (item.telefono || item.telefonoRaw || "").replace(/\D/g, "");
    let existing = item.idSocio ? existingBySocio.get(item.idSocio) : undefined;
    if (!existing && cleanDigits.length >= 7) {
      existing = existingByPhone.get(cleanDigits);
    }
    if (!existing && item.nombreCompleto) {
      existing = existingByName.get(item.nombreCompleto.trim().toLowerCase());
    }

    if (!existing) {
      // Nuevo alumno
      nuevosCount++;
      let finalSocioId =
        item.idSocio ||
        (cleanDigits.length >= 7
          ? `TEL-${cleanDigits}`
          : `AUT-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
      if (existingBySocio.has(finalSocioId)) {
        finalSocioId = `${finalSocioId}-${Math.floor(Math.random() * 1000)}`;
      }
      importedSocioSet.add(finalSocioId);

      toInsert.push({
        organization_id: organizationId,
        id_socio: finalSocioId,
        nombre: item.nombre,
        apellido: item.apellido || "",
        nombre_completo: item.nombreCompleto || `${item.nombre} ${item.apellido || ""}`.trim(),
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
      // Alumno que ya existía (Permanencia / Actualización).
      importedSocioSet.add(existing.id_socio);
      // For any optional field this import doesn't have a recognized column
      // for, keep the alumno's existing value instead of overwriting it with
      // null — the absence of a column means "no info", not "clear this".
      const hasTelefonoCol = presentFields.has("telefono") || presentFields.has("celular");
      const telefono = hasTelefonoCol ? item.telefono : existing.telefono;
      const habilitado = presentFields.has("habilitado") ? item.habilitado : existing.habilitado;
      const membresia = presentFields.has("membresia") ? item.membresia : existing.membresia;
      const finDate = presentFields.has("fechaFin")
        ? item.fechaFin
          ? new Date(item.fechaFin).toISOString()
          : null
        : existing.fecha_fin;
      const asistDate = presentFields.has("ultimaAsistencia")
        ? item.ultimaAsistencia
          ? new Date(item.ultimaAsistencia).toISOString()
          : null
        : existing.ultima_asistencia;

      const hasChanges =
        existing.nombre !== item.nombre ||
        existing.apellido !== (item.apellido || "") ||
        existing.telefono !== telefono ||
        existing.habilitado !== habilitado ||
        existing.membresia !== membresia ||
        (presentFields.has("fechaFin") &&
          (existing.fecha_fin ? existing.fecha_fin.slice(0, 10) : null) !== (item.fechaFin || null)) ||
        (presentFields.has("ultimaAsistencia") &&
          (existing.ultima_asistencia ? existing.ultima_asistencia.slice(0, 10) : null) !== (item.ultimaAsistencia || null));

      if (hasChanges) {
        actualizadosCount++;
        toUpdate.push({
          id: existing.id,
          organization_id: organizationId,
          id_socio: existing.id_socio,
          nombre: item.nombre,
          apellido: item.apellido || "",
          nombre_completo: item.nombreCompleto || `${item.nombre} ${item.apellido || ""}`.trim(),
          telefono,
          telefono_raw: hasTelefonoCol ? item.telefonoRaw : existing.telefono_raw,
          email: presentFields.has("email") ? item.email : existing.email,
          habilitado,
          id_membresia: presentFields.has("idMembresia") ? item.idMembresia : existing.id_membresia,
          membresia,
          fecha_fin: finDate,
          fecha_alta: presentFields.has("fechaAlta")
            ? item.fechaAlta
              ? new Date(item.fechaAlta).toISOString()
              : null
            : existing.fecha_alta,
          ultima_asistencia: asistDate,
          observacion: presentFields.has("observacion") ? item.observacion : existing.observacion,
        });
      } else {
        sinCambiosCount++;
        unchangedIds.push(existing.id);
      }

      // Snapshot del estado actual en esta importación
      snapshotInserts.push({
        organization_id: organizationId,
        student_id: existing.id,
        fecha: todayIso,
        fecha_fin: finDate,
        ultima_asistencia: asistDate,
        membresia,
        habilitado,
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

  // 2. Audit log in import_records — created BEFORE the student writes below
  // so its id can be stamped onto every student this import touches
  // (last_import_id), letting the UI offer a "solo esta importación" view.
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

  const lastImportId = importRecRow?.id ?? null;

  // Combine inserts and updates into unified bulk upsert rows
  const allUpsertRows = [
    ...toInsert.map((row) => ({ ...row, last_import_id: lastImportId, updated_at: todayIso })),
    ...toUpdate.map((row) => ({ ...row, last_import_id: lastImportId, updated_at: todayIso })),
  ];

  // 3. Perform bulk upsert in chunks of 200 (eliminates N+1 loop entirely)
  if (allUpsertRows.length > 0) {
    const upsertChunks = chunkArray(allUpsertRows, 200);
    let processed = 0;
    for (const chunk of upsertChunks) {
      processed += chunk.length;
      onProgress?.(
        `Guardando alumnos (${processed} de ${allUpsertRows.length})...`,
        90 + Math.round((processed / allUpsertRows.length) * 5),
      );
      const { data: upsertedStudents, error: upsErr } = await supabase
        .from("students")
        .upsert(chunk, { onConflict: "organization_id, id_socio" })
        .select("id, id_socio, fecha_fin, ultima_asistencia, membresia, habilitado");

      if (upsErr) {
        console.error("Error en bulk upsert de alumnos:", upsErr);
        throw new Error(`Error al registrar los alumnos en el servidor: ${upsErr.message}`);
      }

      (upsertedStudents || []).forEach((st) => {
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

  // 4. Stamp last_import_id on unchanged students in chunks of 200
  if (unchangedIds.length > 0 && lastImportId) {
    onProgress?.("Actualizando referencias de importación...", 96);
    const idBatches = chunkArray(unchangedIds, 200);
    for (const batch of idBatches) {
      const { error: updErr } = await supabase
        .from("students")
        .update({ last_import_id: lastImportId })
        .in("id", batch);
      if (updErr) console.warn("Aviso al actualizar alumnos sin cambios:", updErr);
    }
  }

  // 5. Batch insert snapshots in chunks of 200
  if (snapshotInserts.length > 0) {
    onProgress?.("Guardando historial...", 97);
    const snapChunks = chunkArray(snapshotInserts, 200);
    for (const chunk of snapChunks) {
      const { error: snapErr } = await supabase.from("snapshots").insert(chunk);
      if (snapErr) console.warn("Aviso al guardar historial de snapshots:", snapErr);
    }
  }

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

  // 6. Reload students and follow-ups with lightweight snapshot synthesis (no 20,000-row download waterfall)
  onProgress?.("Finalizando sincronización...", 98);
  const allFreshRows = await fetchAllRows<any>(() =>
    supabase
      .from("students")
      .select("*")
      .eq("organization_id", organizationId)
      .order("nombre", { ascending: true })
      .order("id", { ascending: true }),
  ).catch(() => [] as any[]);

  const allFollowUps = await fetchAllRows<any>(() =>
    supabase
      .from("follow_ups")
      .select("id, student_id, fecha, tipo, canal, mensaje, resultado")
      .eq("organization_id", organizationId)
      .order("id", { ascending: true }),
  ).catch(() => [] as any[]);

  const fuByStudent: Record<string, any[]> = {};
  allFollowUps.forEach((fu) => {
    if (!fuByStudent[fu.student_id]) fuByStudent[fu.student_id] = [];
    fuByStudent[fu.student_id].push(fu);
  });

  const syncedStudents = allFreshRows.map((r) => {
    const studentSnaps =
      r.fecha_fin || r.ultima_asistencia
        ? [
            {
              id: `snap-${r.id}`,
              student_id: r.id,
              fecha: r.updated_at,
              fecha_fin: r.fecha_fin,
              ultima_asistencia: r.ultima_asistencia,
              membresia: r.membresia,
              habilitado: r.habilitado,
            },
          ]
        : [];
    return mapRowToStudent(r, fuByStudent[r.id] || [], studentSnaps);
  });

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
