import { createClient } from "@/lib/supabase/client";
import type { Student, Config, FollowUp } from "@/lib/types";

export interface MigrationResult {
  migratedStudents: number;
  migratedFollowUps: number;
  configMigrated: boolean;
  errors: string[];
}

export async function migrateLocalStorageToSupabase(
  organizationId: string,
  localStudents: Student[],
  localConfig?: Config,
): Promise<MigrationResult> {
  const supabase = createClient();
  const result: MigrationResult = {
    migratedStudents: 0,
    migratedFollowUps: 0,
    configMigrated: false,
    errors: [],
  };

  if (!organizationId) {
    result.errors.push("No se encontró organization_id para migrar");
    return result;
  }

  // 1. Migrate Configuration
  if (localConfig) {
    try {
      await supabase
        .from("configurations")
        .upsert({
          organization_id: organizationId,
          dias_riesgo_nivel1: localConfig.diasRiesgoNivel1,
          dias_riesgo_nivel2: localConfig.diasRiesgoNivel2,
          dias_riesgo_nivel3: localConfig.diasRiesgoNivel3,
          por_vencer_dias: localConfig.porVencerDias,
          template_recuperacion: localConfig.templates.recuperacion,
          template_cobro: localConfig.templates.cobro,
        }, { onConflict: "organization_id" });

      result.configMigrated = true;
    } catch (err: any) {
      result.errors.push(`Error migrando configuración: ${err.message}`);
    }
  }

  // 2. Migrate Students & Follow-ups
  for (const student of localStudents) {
    if (!student.idSocio || !student.nombre) continue;

    try {
      // Check if student exists
      const { data: existing } = await supabase
        .from("students")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("id_socio", student.idSocio)
        .single();

      let studentDbId = existing?.id;

      if (!existing) {
        // Insert new student
        const { data: inserted, error: insErr } = await supabase
          .from("students")
          .insert({
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
          })
          .select("id")
          .single();

        if (insErr) {
          result.errors.push(`Error insertando alumno ${student.idSocio}: ${insErr.message}`);
          continue;
        }

        studentDbId = inserted.id;
        result.migratedStudents++;
      }

      // Migrate student's follow-ups
      if (studentDbId && student.followUps && student.followUps.length > 0) {
        for (const fu of student.followUps) {
          const { error: fuErr } = await supabase
            .from("follow_ups")
            .insert({
              organization_id: organizationId,
              student_id: studentDbId,
              fecha: fu.fecha,
              tipo: fu.tipo,
              canal: fu.canal,
              mensaje: fu.mensaje,
              resultado: fu.resultado,
            });

          if (!fuErr) {
            result.migratedFollowUps++;
          }
        }
      }
    } catch (err: any) {
      result.errors.push(`Error procesando alumno ${student.idSocio}: ${err.message}`);
    }
  }

  return result;
}
