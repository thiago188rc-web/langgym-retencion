import { computeAnalytics } from "../lib/analytics.ts";

function runAnalyticsTestSuite() {
  console.log("==================================================");
  console.log("🧪 INICIANDO TEST SUITE: ANALÍTICAS Y MÉTRICAS");
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

  // ----------------------------------------------------
  // TEST 1: Cold start (1 sola importación de 100 alumnos)
  // ----------------------------------------------------
  const import1 = {
    id: "imp-1",
    fecha: "2026-06-01T10:00:00.000Z",
    archivo: "SIGA_Junio_2026.xlsx",
    total: 100,
    nuevos: 100,
    actualizados: 0,
    bajas: 0,
    permanecen: 100,
    errores: 0,
  };

  const students1 = Array.from({ length: 100 }, (_, i) => ({
    id: `st-${i + 1}`,
    idSocio: `SOCIO-${i + 1}`,
    nombre: `Alumno`,
    apellido: `${i + 1}`,
    nombreCompleto: `Alumno ${i + 1}`,
    telefono: "5491100000000",
    telefonoRaw: "1100000000",
    email: null,
    habilitado: true,
    idMembresia: "1",
    membresia: "Pase Libre",
    fechaFin: "2026-06-30",
    fechaAlta: "2026-06-01",
    ultimaAsistencia: "2026-06-25",
    observacion: null,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
    snapshots: [{ fecha: "2026-06-01T10:00:00.000Z", fechaFin: "2026-06-30", ultimaAsistencia: "2026-06-25", membresia: "Pase Libre", habilitado: true }],
    followUps: [],
  }));

  const res1 = computeAnalytics(students1, [import1], "todo");

  assert(res1.hasSufficientData === false, "Test 1: Con 1 sola importación informa que no hay suficientes datos históricos para evolución");
  assert(res1.alumnosActuales === 100, "Test 1: Muestra correctamente los 100 alumnos actuales de la base inicial");
  assert(res1.tasaBaja === null, "Test 1: No inventa tasa de baja si no hay período previo de comparación");

  // ----------------------------------------------------
  // TEST 2: Escenario Importación 2 (105 alumnos, 10 nuevos, 5 que ya no aparecen)
  // ----------------------------------------------------
  const import2 = {
    id: "imp-2",
    fecha: "2026-07-01T10:00:00.000Z",
    archivo: "SIGA_Julio_2026.xlsx",
    total: 105,
    nuevos: 10,
    actualizados: 95,
    bajas: 5,
    permanecen: 95,
    errores: 0,
  };

  // Update students array:
  // - First 95 remain and get new snapshot on 2026-07-01
  // - 5 absent students (id 96 to 100) do NOT get a new snapshot and have follow-up
  // - 10 new students (id 101 to 110) are added
  const students2 = [
    ...students1.slice(0, 95).map((s) => ({
      ...s,
      snapshots: [...s.snapshots, { fecha: "2026-07-01T10:00:00.000Z", fechaFin: "2026-07-31", ultimaAsistencia: "2026-07-28", membresia: "Pase Libre", habilitado: true }],
      updatedAt: "2026-07-01T10:00:00.000Z",
    })),
    ...students1.slice(95, 100).map((s) => ({
      ...s,
      followUps: [{ id: `fu-${s.id}`, fecha: "2026-07-05T10:00:00.000Z", tipo: "recuperacion", canal: "whatsapp", mensaje: "Hola, ¿cómo estás?", resultado: "contactado" }],
    })),
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `st-${101 + i}`,
      idSocio: `SOCIO-${101 + i}`,
      nombre: `Nuevo`,
      apellido: `${101 + i}`,
      nombreCompleto: `Nuevo ${101 + i}`,
      telefono: "5491100000000",
      telefonoRaw: "1100000000",
      email: null,
      habilitado: true,
      idMembresia: "1",
      membresia: "Pase Libre",
      fechaFin: "2026-07-31",
      fechaAlta: "2026-07-01",
      ultimaAsistencia: "2026-07-15",
      observacion: null,
      createdAt: "2026-07-01T10:00:00.000Z",
      updatedAt: "2026-07-01T10:00:00.000Z",
      snapshots: [{ fecha: "2026-07-01T10:00:00.000Z", fechaFin: "2026-07-31", ultimaAsistencia: "2026-07-15", membresia: "Pase Libre", habilitado: true }],
      followUps: [],
    })),
  ];

  const res2 = computeAnalytics(students2, [import1, import2], "todo");

  assert(res2.hasSufficientData === true, "Test 2: Con 2 importaciones habilita métricas comparativas");
  assert(res2.alumnosActuales === 105, "Test 2: Alumnos actuales = 105");
  assert(res2.altas === 10, "Test 2: Altas nuevas = 10");
  assert(res2.bajas === 5, "Test 2: Bajas detectadas = 5");
  assert(res2.crecimientoNeto === 5, "Test 2: Crecimiento neto = +5 (10 - 5)");
  assert(res2.tasaBaja === 5, "Test 2: Tasa de baja = 5% (5 bajas / 100 base inicial)");
  assert(res2.tasaRetencion === 95, "Test 2: Tasa de retención = 95% (95 que continúan / 100 base inicial)");
  assert(res2.bajasList.length === 5, "Test 2: Identifica exactamente los 5 alumnos ausentes");
  assert(res2.bajasList[0].ultimoSeguimiento !== undefined, "Test 2: Preserva el historial de seguimiento de los alumnos dados de baja");

  // ----------------------------------------------------
  // TEST 3: Escenario Importación 3 (110 alumnos, 12 nuevos, 7 que ya no aparecen)
  // ----------------------------------------------------
  const import3 = {
    id: "imp-3",
    fecha: "2026-08-01T10:00:00.000Z",
    archivo: "SIGA_Agosto_2026.xlsx",
    total: 110,
    nuevos: 12,
    actualizados: 98,
    bajas: 7,
    permanecen: 98,
    errores: 0,
  };

  const res3 = computeAnalytics(students2, [import1, import2, import3], "todo");

  assert(res3.evolucion.length === 3, "Test 3: Evolución mensual contiene las 3 importaciones");
  assert(res3.evolucion[2].total === 110, "Test 3: Importación 3 total = 110 alumnos");
  assert(res3.evolucion[2].altas === 12, "Test 3: Importación 3 altas = 12");
  assert(res3.evolucion[2].bajas === 7, "Test 3: Importación 3 bajas = 7");
  assert(res3.evolucion[2].neto === 5, "Test 3: Importación 3 neto = +5 (12 - 7)");

  console.log("\n==================================================");
  console.log(`📊 RESULTADO TEST SUITE: ${passed} PASSED / ${failed} FAILED`);
  console.log("==================================================");
}

runAnalyticsTestSuite();
