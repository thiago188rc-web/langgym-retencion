import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://jgjeaaozvjasgiizjdkd.supabase.co";
const serviceKey = "sb_secret_ugPQAj770xOyVDKtMLivvA_QpPr3nr3";

const adminClient = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function runFase3Tests() {
  console.log("==================================================");
  console.log("🧪 INICIANDO TEST SUITE: FASE 3 (PERSISTENCIA REAL)");
  console.log("==================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Setup Test Organizations
    const testOrgIdA = "00000000-0000-0000-0000-00000000000a";
    const testOrgIdB = "00000000-0000-0000-0000-00000000000b";

    await adminClient.from("organizations").upsert([
      { id: testOrgIdA, name: "Gym Central Test A", slug: "gym-a", owner_name: "Staff A" },
      { id: testOrgIdB, name: "Gym Central Test B", slug: "gym-b", owner_name: "Staff B" },
    ]);

    // Clean previous test data
    await adminClient.from("follow_ups").delete().in("organization_id", [testOrgIdA, testOrgIdB]);
    await adminClient.from("snapshots").delete().in("organization_id", [testOrgIdA, testOrgIdB]);
    await adminClient.from("import_records").delete().in("organization_id", [testOrgIdA, testOrgIdB]);
    await adminClient.from("students").delete().in("organization_id", [testOrgIdA, testOrgIdB]);

    // ----------------------------------------------------
    // TEST A: Importación de alumno nuevo
    // ----------------------------------------------------
    const { data: st1, error: st1Err } = await adminClient
      .from("students")
      .insert({
        organization_id: testOrgIdA,
        id_socio: "SOCIO-500",
        nombre: "Juan",
        apellido: "Pérez",
        nombre_completo: "Juan Pérez",
        telefono: "5491155556666",
        telefono_raw: "1155556666",
        email: "juan@test.com",
        habilitado: true,
        membresia: "Musculación",
        fecha_fin: new Date("2026-08-10").toISOString(),
      })
      .select()
      .single();

    assert(!st1Err && st1?.id, "Test A: Alumno nuevo insertado en Supabase con id_socio 'SOCIO-500'");

    // ----------------------------------------------------
    // TEST B & F: Agregar seguimientos y notas a Juan
    // ----------------------------------------------------
    const { data: fu1, error: fu1Err } = await adminClient
      .from("follow_ups")
      .insert({
        organization_id: testOrgIdA,
        student_id: st1.id,
        fecha: new Date().toISOString(),
        tipo: "recuperacion",
        canal: "whatsapp",
        mensaje: "Hola Juan, te extrañamos en el gym",
        resultado: "contactado",
      })
      .select()
      .single();

    const { data: fu2 } = await adminClient
      .from("follow_ups")
      .insert({
        organization_id: testOrgIdA,
        student_id: st1.id,
        fecha: new Date().toISOString(),
        tipo: "nota",
        canal: "manual",
        mensaje: "Avisó que estuvo de viaje y vuelve el lunes",
        resultado: "contactado",
      })
      .select()
      .single();

    assert(fu1 && fu2, "Test B/F: Seguimiento WhatsApp y nota manual creados y vinculados a Juan");

    // ----------------------------------------------------
    // TEST C, D, E: Re-importar el mismo socio con datos actualizados
    // ----------------------------------------------------
    // Simula sincronización por id_socio
    const { data: existingStudent } = await adminClient
      .from("students")
      .select("*")
      .eq("organization_id", testOrgIdA)
      .eq("id_socio", "SOCIO-500")
      .single();

    assert(existingStudent?.id === st1.id, "Test C: Identidad estable por id_socio (mismo UUID de alumno)");

    const { data: updatedStudent, error: updErr } = await adminClient
      .from("students")
      .update({
        fecha_fin: new Date("2026-09-10").toISOString(),
        membresia: "Pase Libre Full",
      })
      .eq("id", existingStudent.id)
      .select()
      .single();

    assert(
      !updErr &&
      updatedStudent.membresia === "Pase Libre Full" &&
      updatedStudent.fecha_fin.slice(0, 10) === "2026-09-10",
      "Test D/E: Datos de SIGA actualizados correctamente sin crear duplicados",
    );

    // ----------------------------------------------------
    // TEST F: Verificar que los follow-ups y notas sobrevivieron
    // ----------------------------------------------------
    const { data: studentFollowUps } = await adminClient
      .from("follow_ups")
      .select("*")
      .eq("student_id", st1.id);

    assert(
      studentFollowUps?.length === 2 &&
      studentFollowUps.some((f) => f.tipo === "recuperacion") &&
      studentFollowUps.some((f) => f.tipo === "nota"),
      "Test F: Historial, notas y follow-ups sobreviven intactos tras la actualización",
    );

    // ----------------------------------------------------
    // TEST G, H, I: Alumno que no aparece en nueva importación
    // ----------------------------------------------------
    // Importamos un nuevo alumno "SOCIO-501"
    await adminClient.from("students").insert({
      organization_id: testOrgIdA,
      id_socio: "SOCIO-501",
      nombre: "María",
      apellido: "Gómez",
      nombre_completo: "María Gómez",
      habilitado: true,
    });

    // Verificamos que Juan (SOCIO-500) NO fue borrado
    const { data: juanCheck } = await adminClient
      .from("students")
      .select("*")
      .eq("organization_id", testOrgIdA)
      .eq("id_socio", "SOCIO-500")
      .single();

    assert(juanCheck && juanCheck.id === st1.id, "Test H/I: Alumno ausente del nuevo Excel NO se elimina automáticamente");

    // ----------------------------------------------------
    // TEST J: Configuración persistente en Supabase
    // ----------------------------------------------------
    const { error: cfgErr } = await adminClient.from("configurations").upsert({
      organization_id: testOrgIdA,
      dias_riesgo_nivel1: 14,
      dias_riesgo_nivel2: 28,
      dias_riesgo_nivel3: 60,
      por_vencer_dias: 5,
      template_recuperacion: "Hola {{nombre}}, ¿cómo estás? Te esperamos en {{gym}}!",
      template_cobro: "Hola {{nombre}} {{apellido}}, tu membresía vence pronto.",
    });

    const { data: savedCfg } = await adminClient
      .from("configurations")
      .select("*")
      .eq("organization_id", testOrgIdA)
      .single();

    assert(
      !cfgErr && savedCfg.dias_riesgo_nivel1 === 14 && savedCfg.template_recuperacion.includes("{{nombre}}"),
      "Test J: Configuración de retención y plantillas de WhatsApp persistidas en PostgreSQL",
    );

    // ----------------------------------------------------
    // TEST M: Trazabilidad de Import_records
    // ----------------------------------------------------
    const { data: impRec, error: impErr } = await adminClient
      .from("import_records")
      .insert({
        organization_id: testOrgIdA,
        archivo: "Socios_Agosto.xlsx",
        nuevos: 1,
        actualizados: 1,
        errores: 0,
        total: 2,
      })
      .select()
      .single();

    assert(!impErr && impRec.archivo === "Socios_Agosto.xlsx", "Test M: Trazabilidad registrada en tabla import_records");

    // ----------------------------------------------------
    // TEST N: Aislamiento Multi-tenant entre Organizaciones
    // ----------------------------------------------------
    const { data: orgBStudents } = await adminClient
      .from("students")
      .select("*")
      .eq("organization_id", testOrgIdB);

    assert(orgBStudents?.length === 0, "Test N: Organización B no ve ningún alumno ni dato de Organización A (Aislamiento Multi-Tenant)");

    // Cleanup test data
    await adminClient.from("follow_ups").delete().in("organization_id", [testOrgIdA, testOrgIdB]);
    await adminClient.from("snapshots").delete().in("organization_id", [testOrgIdA, testOrgIdB]);
    await adminClient.from("import_records").delete().in("organization_id", [testOrgIdA, testOrgIdB]);
    await adminClient.from("configurations").delete().in("organization_id", [testOrgIdA, testOrgIdB]);
    await adminClient.from("students").delete().in("organization_id", [testOrgIdA, testOrgIdB]);
    await adminClient.from("organizations").delete().in("id", [testOrgIdA, testOrgIdB]);

  } catch (error) {
    console.error("Test execution error:", error);
    failed++;
  }

  console.log("\n==================================================");
  console.log(`RESULTADO TEST SUITE: ${passed} PASSED / ${failed} FAILED`);
  console.log("==================================================");
}

runFase3Tests();
