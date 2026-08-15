console.log("================================================================================");
console.log("🧪 EJECUTANDO TESTS DEL PANEL ADMINISTRATIVO DE CLASES (PASO 6)");
console.log("================================================================================\n");

let passed = 0;
let total = 0;

function assert(condition, testName) {
  total++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
  }
}

// 1. Mock DB
const mockDb = {
  classTypes: [
    { id: "type-func", name: "Entrenamiento Funcional", default_capacity: 30, active: true },
    { id: "type-yoga", name: "Yoga", default_capacity: null, active: true },
    { id: "type-flexi", name: "Flexi-Run", default_capacity: null, active: true },
    { id: "type-stretch", name: "Stretching", default_capacity: 15, active: true },
  ],
  schedules: [
    // Lunes (1)
    { id: "sch-func-mon-08", class_type_id: "type-func", day_of_week: 1, start_time: "08:00", capacity: 30, active: true },
    { id: "sch-func-mon-17", class_type_id: "type-func", day_of_week: 1, start_time: "17:00", capacity: 30, active: true },
    { id: "sch-func-mon-18", class_type_id: "type-func", day_of_week: 1, start_time: "18:00", capacity: 30, active: true },
    { id: "sch-yoga-mon-08", class_type_id: "type-yoga", day_of_week: 1, start_time: "08:00", capacity: null, active: true },
    { id: "sch-flexi-mon-17", class_type_id: "type-flexi", day_of_week: 1, start_time: "17:00", capacity: null, active: true },
    // Martes (2)
    { id: "sch-stretch-tue-09", class_type_id: "type-stretch", day_of_week: 2, start_time: "09:00", capacity: 15, active: true },
  ],
  reservations: [],
  students: [
    { id: "std-1", nombre_completo: "Juan Perez", id_socio: "101", telefono: "1122334455" },
    { id: "std-2", nombre_completo: "Maria Gomez", id_socio: "102", telefono: "1199887766" },
  ],
};

// 2. Logic simulation
function simulateGetAdminClasses(dayOfWeek, dateISO) {
  const daySchedules = mockDb.schedules.filter((s) => s.day_of_week === dayOfWeek && s.active);
  return daySchedules.map((s) => {
    const type = mockDb.classTypes.find((t) => t.id === s.class_type_id);
    const reservations = mockDb.reservations.filter((r) => r.class_schedule_id === s.id && r.class_date === dateISO);
    const confirmedCount = reservations.filter((r) => r.status === "confirmed").length;
    const attendedCount = reservations.filter((r) => r.status === "attended").length;
    const noShowCount = reservations.filter((r) => r.status === "no_show").length;
    const cancelledCount = reservations.filter((r) => r.status === "cancelled").length;
    const totalBooked = confirmedCount + attendedCount;

    const availableSpots = s.capacity !== null ? Math.max(0, s.capacity - totalBooked) : null;
    let statusBadge = "DISPONIBLE";
    if (s.capacity === null) statusBadge = "SIN_CUPO";
    else if (availableSpots === 0) statusBadge = "COMPLETA";
    else if (availableSpots <= 3) statusBadge = "ULTIMOS_LUGARES";

    return {
      scheduleId: s.id,
      className: type.name,
      startTime: s.start_time,
      capacity: s.capacity,
      confirmedCount,
      attendedCount,
      noShowCount,
      cancelledCount,
      availableSpots,
      statusBadge,
    };
  });
}

function simulateAdminManualBooking(scheduleId, dateISO, studentId, callerRole) {
  if (!["owner", "admin", "staff"].includes(callerRole)) {
    return { success: false, error: "Permisos insuficientes" };
  }
  const sched = mockDb.schedules.find((s) => s.id === scheduleId);
  if (!sched || sched.capacity === null) {
    return { success: false, error: "Clase sin cupo o inexistente" };
  }
  const booked = mockDb.reservations.filter(
    (r) => r.class_schedule_id === scheduleId && r.class_date === dateISO && ["confirmed", "attended"].includes(r.status)
  ).length;

  if (booked >= sched.capacity) {
    return { success: false, error: "Cupo completo" };
  }

  const res = {
    id: `res-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    class_schedule_id: scheduleId,
    class_date: dateISO,
    student_id: studentId,
    status: "confirmed",
    created_at: new Date().toISOString(),
    attended_at: null,
    cancelled_at: null,
  };
  mockDb.reservations.push(res);
  return { success: true, reservation: res };
}

function simulateAdminUpdateAttendance(reservationId, status, callerRole) {
  if (!["owner", "admin", "staff"].includes(callerRole)) {
    return { success: false, error: "Permisos insuficientes" };
  }
  const res = mockDb.reservations.find((r) => r.id === reservationId);
  if (!res) return { success: false, error: "Reserva no encontrada" };

  res.status = status;
  if (status === "attended") res.attended_at = new Date().toISOString();
  if (status === "cancelled") res.cancelled_at = new Date().toISOString();

  return { success: true };
}

function simulateAdminUpdateCapacity(scheduleId, newCapacity, callerRole) {
  if (!["owner", "admin", "staff"].includes(callerRole)) {
    return { success: false, error: "Permisos insuficientes" };
  }
  const sched = mockDb.schedules.find((s) => s.id === scheduleId);
  if (!sched) return { success: false, error: "Horario no encontrado" };

  sched.capacity = newCapacity;
  return { success: true };
}

// -------------------------------------------------------------
// EXECUTE TESTS
// -------------------------------------------------------------

// TEST 1: Monday classes loaded correctly
const mondayClasses = simulateGetAdminClasses(1, "2026-08-17");
assert(mondayClasses.length === 5, "Lunes carga 5 horarios (3 Funcional, 1 Yoga, 1 Flexi-Run)");

// TEST 2: Tuesday classes loaded correctly
const tuesdayClasses = simulateGetAdminClasses(2, "2026-08-18");
assert(tuesdayClasses.some((c) => c.className === "Stretching" && c.capacity === 15), "Martes incluye Stretching con cupo de 15");

// TEST 3: Yoga and Flexi-Run pending capacity detection
const yogaMon = mondayClasses.find((c) => c.className === "Yoga");
assert(yogaMon.statusBadge === "SIN_CUPO" && yogaMon.capacity === null, "Yoga detecta SIN_CUPO mientras no esté configurado");

// TEST 4: Admin updates Yoga capacity to 15
const updateYoga = simulateAdminUpdateCapacity("sch-yoga-mon-08", 15, "admin");
assert(updateYoga.success === true, "Andrés actualiza el cupo de Yoga a 15 exitosamente");
const mondayAfterUpdate = simulateGetAdminClasses(1, "2026-08-17");
const updatedYoga = mondayAfterUpdate.find((c) => c.className === "Yoga");
assert(updatedYoga.capacity === 15 && updatedYoga.statusBadge === "DISPONIBLE", "Yoga ahora tiene 15 cupos y figura DISPONIBLE");

// TEST 5: Admin registers manual student booking
const manualRes = simulateAdminManualBooking("sch-func-mon-18", "2026-08-17", "std-1", "admin");
assert(manualRes.success === true, "Admin inscribe manualmente al alumno std-1 (Juan Perez)");

// TEST 6: Attendance marking (PRESENTE)
const markPresent = simulateAdminUpdateAttendance(manualRes.reservation.id, "attended", "staff");
assert(markPresent.success === true, "Staff marca al alumno como PRESENTE (status = attended)");
assert(manualRes.reservation.attended_at !== null, "attended_at guardó la marca temporal correctamente");

// TEST 7: Attendance marking (AUSENTE)
const markAbsent = simulateAdminUpdateAttendance(manualRes.reservation.id, "no_show", "staff");
assert(markAbsent.success === true, "Staff puede cambiar estado a AUSENTE (status = no_show)");

// TEST 8: Admin cancellation preserves record
const cancelRes = simulateAdminUpdateAttendance(manualRes.reservation.id, "cancelled", "admin");
assert(cancelRes.success === true, "Admin cancela la reserva del alumno");
assert(manualRes.reservation.cancelled_at !== null, "Cancelación conservó el registro en historial con cancelled_at");

// TEST 9: Spots liberated immediately after cancellation
const mondayAfterCancel = simulateGetAdminClasses(1, "2026-08-17");
const func18 = mondayAfterCancel.find((c) => c.scheduleId === "sch-func-mon-18");
assert(func18.availableSpots === 30, "Tras cancelar, el cupo volvió a 30 lugares libres inmediatamente");

// TEST 10: Security - Client blocked from updating capacity
const clientTamper = simulateAdminUpdateCapacity("sch-func-mon-18", 100, "cliente");
assert(clientTamper.success === false && clientTamper.error.includes("Permisos insuficientes"), "Seguridad: Cliente no puede modificar cupos");

// TEST 11: Security - Client blocked from manual booking
const clientManual = simulateAdminManualBooking("sch-func-mon-18", "2026-08-17", "std-2", "cliente");
assert(clientManual.success === false && clientManual.error.includes("Permisos insuficientes"), "Seguridad: Cliente no puede ejecutar reservas manuales de terceros");

// TEST 12: Security - Client blocked from changing attendance
const clientAttendance = simulateAdminUpdateAttendance(manualRes.reservation.id, "attended", "cliente");
assert(clientAttendance.success === false && clientAttendance.error.includes("Permisos insuficientes"), "Seguridad: Cliente no puede alterar registros de asistencia");

console.log("\n================================================================================");
console.log(`📊 RESULTADO DE TESTS DEL PANEL DE CLASES: ${passed}/${total} pruebas superadas.`);
console.log("================================================================================\n");
