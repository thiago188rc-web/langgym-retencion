console.log("================================================================================");
console.log("🧪 EJECUTANDO TESTS DEL FLUJO COMPLETO DEL PORTAL DE ALUMNO (PASO 4)");
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

// 1. Mock Simulation of Client Portal State & Flow
class MockClientSession {
  constructor(userId, orgId, role, studentId = null) {
    this.userId = userId;
    this.orgId = orgId;
    this.role = role;
    this.studentId = studentId;
  }
}

class MockClassEngine {
  constructor() {
    this.schedules = [
      { id: "sched-func-18", name: "Entrenamiento Funcional", dayOfWeek: 1, startTime: "18:00", capacity: 30 },
      { id: "sched-stretching-19", name: "Stretching", dayOfWeek: 2, startTime: "19:00", capacity: 15 },
      { id: "sched-yoga-08", name: "Yoga", dayOfWeek: 1, startTime: "08:00", capacity: null }, // Pending
    ];
    this.reservations = [];
  }

  getAvailableClasses(dateISO, currentUserId) {
    const [y, m, d] = dateISO.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();

    return this.schedules
      .filter((s) => s.dayOfWeek === dow)
      .map((s) => {
        const confirmed = this.reservations.filter(
          (r) => r.scheduleId === s.id && r.date === dateISO && r.status === "confirmed"
        ).length;

        const isUserReserved = this.reservations.some(
          (r) => r.scheduleId === s.id && r.date === dateISO && r.userId === currentUserId && r.status === "confirmed"
        );

        const spotsLeft = s.capacity != null ? Math.max(0, s.capacity - confirmed) : null;
        const isFull = s.capacity != null && confirmed >= s.capacity;

        return {
          scheduleId: s.id,
          name: s.name,
          startTime: s.startTime,
          capacity: s.capacity,
          confirmedReservations: confirmed,
          availableSpots: spotsLeft,
          isUserReserved,
          isFull,
          isPendingCapacity: s.capacity == null,
        };
      });
  }

  bookClass(scheduleId, dateISO, user) {
    const schedule = this.schedules.find((s) => s.id === scheduleId);
    if (!schedule) return { success: false, error: "Horario no encontrado" };

    if (schedule.capacity == null) {
      return { success: false, error: "Esta clase aún no tiene cupo definido por el gimnasio" };
    }

    const alreadyReserved = this.reservations.some(
      (r) => r.scheduleId === scheduleId && r.date === dateISO && r.userId === user.userId && r.status === "confirmed"
    );
    if (alreadyReserved) {
      return { success: false, error: "Ya tenés una reserva confirmada para este horario." };
    }

    const activeCount = this.reservations.filter(
      (r) => r.scheduleId === scheduleId && r.date === dateISO && r.status === "confirmed"
    ).length;

    if (activeCount >= schedule.capacity) {
      return { success: false, error: "Cupo completo. No quedan lugares disponibles para este horario." };
    }

    const newRes = {
      id: `res-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      scheduleId,
      date: dateISO,
      userId: user.userId,
      status: "confirmed",
    };
    this.reservations.push(newRes);

    return {
      success: true,
      reservationId: newRes.id,
      className: schedule.name,
      spotsLeft: schedule.capacity - (activeCount + 1),
    };
  }

  cancelReservation(reservationId, user) {
    const res = this.reservations.find((r) => r.id === reservationId);
    if (!res) return { success: false, error: "Reserva no encontrada." };
    if (res.userId !== user.userId && user.role !== "admin") {
      return { success: false, error: "No tenés permiso para cancelar esta reserva." };
    }
    if (res.status === "cancelled") {
      return { success: false, error: "La reserva ya fue cancelada previamente." };
    }

    res.status = "cancelled";
    return { success: true };
  }
}

// -------------------------------------------------------------
// Test Scenario Executions
// -------------------------------------------------------------

const engine = new MockClassEngine();
const alumno1 = new MockClientSession("user-alumno-1", "org-langgym", "cliente");
const alumno2 = new MockClientSession("user-alumno-2", "org-langgym", "cliente");

// 1. Check availability on Monday 2026-08-17
const mondayClasses = engine.getAvailableClasses("2026-08-17", alumno1.userId);
assert(mondayClasses.length === 2, "Lunes 2026-08-17 tiene 2 clases (Funcional y Yoga)");

const funcional = mondayClasses.find((c) => c.name === "Entrenamiento Funcional");
assert(funcional.availableSpots === 30 && !funcional.isUserReserved, "Funcional inicia con 30 cupos libres");

const yoga = mondayClasses.find((c) => c.name === "Yoga");
assert(yoga.isPendingCapacity === true, "Yoga detecta cupo pendiente (NULL)");

// 2. Attempt to book Yoga (pending capacity)
const bookYogaRes = engine.bookClass(yoga.scheduleId, "2026-08-17", alumno1);
assert(bookYogaRes.success === false && bookYogaRes.error.includes("aún no tiene cupo definido"), "No permite reservar clase con cupo pendiente");

// 3. Alumno 1 books Funcional
const bookFuncRes1 = engine.bookClass(funcional.scheduleId, "2026-08-17", alumno1);
assert(bookFuncRes1.success === true && bookFuncRes1.spotsLeft === 29, "Alumno 1 reserva Funcional exitosamente (quedan 29 cupos)");

// 4. Check live status after Alumno 1 booking
const updatedAfterBook1 = engine.getAvailableClasses("2026-08-17", alumno1.userId);
const updatedFunc1 = updatedAfterBook1.find((c) => c.name === "Entrenamiento Funcional");
assert(updatedFunc1.isUserReserved === true, "El portal muestra 'Ya estás inscripto' para Alumno 1");
assert(updatedFunc1.availableSpots === 29, "El cupo restante se actualiza a 29");

// 5. Alumno 1 tries to double book same class
const duplicateBook = engine.bookClass(funcional.scheduleId, "2026-08-17", alumno1);
assert(duplicateBook.success === false && duplicateBook.error.includes("Ya tenés una reserva confirmada"), "Rechaza reserva duplicada para el mismo alumno");

// 6. Alumno 2 books the same class
const bookFuncRes2 = engine.bookClass(funcional.scheduleId, "2026-08-17", alumno2);
assert(bookFuncRes2.success === true && bookFuncRes2.spotsLeft === 28, "Alumno 2 puede reservar el mismo horario (quedan 28 cupos)");

// 7. Security: Alumno 2 tries to cancel Alumno 1's reservation
const unauthorizedCancel = engine.cancelReservation(bookFuncRes1.reservationId, alumno2);
assert(unauthorizedCancel.success === false && unauthorizedCancel.error.includes("No tenés permiso"), "Seguridad: Alumno 2 no puede cancelar reserva de Alumno 1");

// 8. Alumno 1 cancels their own reservation
const validCancel = engine.cancelReservation(bookFuncRes1.reservationId, alumno1);
assert(validCancel.success === true, "Alumno 1 cancela su propia reserva correctamente");

// 9. Check spot recovery after cancellation
const updatedAfterCancel = engine.getAvailableClasses("2026-08-17", alumno1.userId);
const funcAfterCancel = updatedAfterCancel.find((c) => c.name === "Entrenamiento Funcional");
assert(funcAfterCancel.isUserReserved === false, "El estado del botón vuelve a 'Reservar'");
assert(funcAfterCancel.availableSpots === 29, "El cupo se liberó inmediatamente (29 cupos disponibles)");

// 10. Re-cancellation attempt
const duplicateCancel = engine.cancelReservation(bookFuncRes1.reservationId, alumno1);
assert(duplicateCancel.success === false && duplicateCancel.error.includes("ya fue cancelada"), "No permite cancelar dos veces la misma reserva");

console.log("\n================================================================================");
console.log(`📊 RESULTADO DE TESTS DEL PORTAL: ${passed}/${total} pruebas superadas.`);
console.log("================================================================================\n");
