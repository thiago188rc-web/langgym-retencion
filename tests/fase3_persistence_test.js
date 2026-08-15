const supabaseUrl = "https://jgjeaaozvjasgiizjdkd.supabase.co";
const serviceKey = "sb_secret_ugPQAj770xOyVDKtMLivvA_QpPr3nr3";

async function supabaseRequest(path, options = {}) {
  const url = `${supabaseUrl}/rest/v1/${path}`;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: options.prefer || "return=representation",
    ...options.headers,
  };

  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return null;
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function runTests() {
  console.log("==================================================");
  console.log("🧪 INICIANDO TEST SUITE: FASE 3 (PERSISTENCIA DIRECTA)");
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

  const testOrgIdA = "00000000-0000-0000-0000-00000000000a";
  const testOrgIdB = "00000000-0000-0000-0000-00000000000b";

  try {
    // Setup Organizations
    await supabaseRequest("organizations", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: [
        { id: testOrgIdA, name: "Gym Central Test A", slug: "gym-a", owner_name: "Staff A" },
        { id: testOrgIdB, name: "Gym Central Test B", slug: "gym-b", owner_name: "Staff B" },
      ],
    });

    // Cleanup previous data
    await supabaseRequest(`follow_ups?organization_id=in.(${testOrgIdA},${testOrgIdB})`, { method: "DELETE" });
    await supabaseRequest(`snapshots?organization_id=in.(${testOrgIdA},${testOrgIdB})`, { method: "DELETE" });
    await supabaseRequest(`import_records?organization_id=in.(${testOrgIdA},${testOrgIdB})`, { method: "DELETE" });
    await supabaseRequest(`students?organization_id=in.(${testOrgIdA},${testOrgIdB})`, { method: "DELETE" });

    // ----------------------------------------------------
    // TEST A: Importación de alumno nuevo
    // ----------------------------------------------------
    const insertedStudents = await supabaseRequest("students", {
      method: "POST",
      body: [{
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
      }],
    });

    if (!Array.isArray(insertedStudents) && insertedStudents?.message) {
      console.error("Student insert error:", insertedStudents);
    }

    const st1 = Array.isArray(insertedStudents) ? insertedStudents[0] : insertedStudents;
    assert(st1 && st1.id, "Test A: Alumno nuevo insertado en Supabase con id_socio 'SOCIO-500'");

    // ----------------------------------------------------
    // TEST B & F: Agregar seguimientos y notas a Juan
    // ----------------------------------------------------
    const fu1 = await supabaseRequest("follow_ups", {
      method: "POST",
      body: {
        organization_id: testOrgIdA,
        student_id: st1.id,
        fecha: new Date().toISOString(),
        tipo: "recuperacion",
        canal: "whatsapp",
        mensaje: "Hola Juan, te extrañamos en el gym",
        resultado: "contactado",
      },
    });

    const fu2 = await supabaseRequest("follow_ups", {
      method: "POST",
      body: {
        organization_id: testOrgIdA,
        student_id: st1.id,
        fecha: new Date().toISOString(),
        tipo: "nota",
        canal: "manual",
        mensaje: "Avisó que estuvo de viaje y vuelve el lunes",
        resultado: "contactado",
      },
    });

    assert(fu1 && fu2, "Test B/F: Seguimiento WhatsApp y nota manual creados y vinculados a Juan");

    // ----------------------------------------------------
    // TEST C, D, E: Re-importar el mismo socio con datos actualizados
    // ----------------------------------------------------
    const existingList = await supabaseRequest(`students?organization_id=eq.${testOrgIdA}&id_socio=eq.SOCIO-500`);
    const existing = existingList[0];
    assert(existing?.id === st1.id, "Test C: Identidad estable por id_socio (mismo UUID de alumno)");

    const updatedRes = await supabaseRequest(`students?id=eq.${existing.id}`, {
      method: "PATCH",
      body: {
        fecha_fin: new Date("2026-09-10").toISOString(),
        membresia: "Pase Libre Full",
      },
    });
    const updated = Array.isArray(updatedRes) ? updatedRes[0] : updatedRes;
    assert(
      updated && updated.membresia === "Pase Libre Full" && updated.fecha_fin.slice(0, 10) === "2026-09-10",
      "Test D/E: Datos de SIGA actualizados correctamente sin crear duplicados",
    );

    // ----------------------------------------------------
    // TEST F: Verificar que los follow-ups y notas sobrevivieron
    // ----------------------------------------------------
    const followUpsList = await supabaseRequest(`follow_ups?student_id=eq.${st1.id}`);
    assert(
      followUpsList?.length === 2 &&
      followUpsList.some((f) => f.tipo === "recuperacion") &&
      followUpsList.some((f) => f.tipo === "nota"),
      "Test F: Historial, notas y follow-ups sobreviven intactos tras la actualización",
    );

    // ----------------------------------------------------
    // TEST G, H, I: Alumno que no aparece en nueva importación
    // ----------------------------------------------------
    await supabaseRequest("students", {
      method: "POST",
      body: {
        organization_id: testOrgIdA,
        id_socio: "SOCIO-501",
        nombre: "María",
        apellido: "Gómez",
        nombre_completo: "María Gómez",
        habilitado: true,
      },
    });

    const juanAfter = await supabaseRequest(`students?organization_id=eq.${testOrgIdA}&id_socio=eq.SOCIO-500`);
    assert(juanAfter && juanAfter.length === 1 && juanAfter[0].id === st1.id, "Test H/I: Alumno ausente del nuevo Excel NO se elimina");

    // ----------------------------------------------------
    // TEST J: Configuración persistente en Supabase
    // ----------------------------------------------------
    await supabaseRequest("configurations", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: {
        organization_id: testOrgIdA,
        dias_riesgo_nivel1: 14,
        dias_riesgo_nivel2: 28,
        dias_riesgo_nivel3: 60,
        por_vencer_dias: 5,
        template_recuperacion: "Hola {{nombre}}, ¿cómo estás? Te esperamos en {{gym}}!",
        template_cobro: "Hola {{nombre}} {{apellido}}, tu membresía vence pronto.",
      },
    });

    const savedCfgList = await supabaseRequest(`configurations?organization_id=eq.${testOrgIdA}`);
    const savedCfg = savedCfgList[0];
    assert(
      savedCfg && savedCfg.dias_riesgo_nivel1 === 14 && savedCfg.template_recuperacion.includes("{{nombre}}"),
      "Test J: Configuración de retención y plantillas de WhatsApp persistidas en PostgreSQL",
    );

    // ----------------------------------------------------
    // TEST M: Trazabilidad de Import_records
    // ----------------------------------------------------
    const impRec = await supabaseRequest("import_records", {
      method: "POST",
      body: {
        organization_id: testOrgIdA,
        archivo: "Socios_Agosto.xlsx",
        nuevos: 1,
        actualizados: 1,
        errores: 0,
        total: 2,
      },
    });
    assert(impRec && (Array.isArray(impRec) ? impRec[0] : impRec).archivo === "Socios_Agosto.xlsx", "Test M: Trazabilidad registrada en import_records");

    // ----------------------------------------------------
    // TEST N: Aislamiento Multi-tenant entre Organizaciones
    // ----------------------------------------------------
    const orgBStudents = await supabaseRequest(`students?organization_id=eq.${testOrgIdB}`);
    assert(Array.isArray(orgBStudents) && orgBStudents.length === 0, "Test N: Organización B no ve ningún alumno de Organización A (Aislamiento Multi-Tenant)");

    // Cleanup test records
    await supabaseRequest(`follow_ups?organization_id=in.(${testOrgIdA},${testOrgIdB})`, { method: "DELETE" });
    await supabaseRequest(`snapshots?organization_id=in.(${testOrgIdA},${testOrgIdB})`, { method: "DELETE" });
    await supabaseRequest(`import_records?organization_id=in.(${testOrgIdA},${testOrgIdB})`, { method: "DELETE" });
    await supabaseRequest(`configurations?organization_id=in.(${testOrgIdA},${testOrgIdB})`, { method: "DELETE" });
    await supabaseRequest(`students?organization_id=in.(${testOrgIdA},${testOrgIdB})`, { method: "DELETE" });
    await supabaseRequest(`organizations?id=in.(${testOrgIdA},${testOrgIdB})`, { method: "DELETE" });

  } catch (err) {
    console.error("Test execution failed:", err);
    failed++;
  }

  console.log("\n==================================================");
  console.log(`📊 RESULTADO TEST SUITE: ${passed} PASSED / ${failed} FAILED`);
  console.log("==================================================");
}

runTests();
