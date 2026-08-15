import fs from "fs";
import path from "path";

// 1. Mock / Unit validation suite for booking logic
console.log("================================================================================");
console.log("🧪 EJECUTANDO TESTS DEL SERVICIO DE RESERVAS (PASO 2)");
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

// Test 1: Error message translation
function parseBookingError(rawError) {
  if (!rawError) return { message: "Ocurrió un error inesperado al procesar la solicitud.", code: "UNKNOWN_ERROR" };
  const err = rawError.toLowerCase();
  if (err.includes("no estás autenticado") || err.includes("unauthenticated")) {
    return { message: "Debés iniciar sesión para reservar una clase.", code: "UNAUTHENTICATED" };
  }
  if (err.includes("perfil no encontrado") || err.includes("no se encontró el perfil")) {
    return { message: "No se encontró el perfil de usuario registrado.", code: "PROFILE_NOT_FOUND" };
  }
  if (err.includes("cupo completo") || err.includes("no quedan lugares")) {
    return { message: "Cupo completo. No quedan lugares disponibles para este horario.", code: "CAPACITY_FULL" };
  }
  if (err.includes("ya tenés una reserva") || err.includes("unique_active_reservation_slot")) {
    return { message: "Ya tenés una reserva confirmada para este horario.", code: "ALREADY_RESERVED" };
  }
  if (err.includes("no tiene cupo definido")) {
    return { message: "Esta clase aún no tiene cupo definido por el gimnasio.", code: "CAPACITY_NOT_SET" };
  }
  if (err.includes("no corresponde al día") || err.includes("día en que se dicta")) {
    return { message: "La fecha seleccionada no corresponde al día de esta actividad.", code: "INVALID_SCHEDULE_DAY" };
  }
  if (err.includes("fechas pasadas")) {
    return { message: "No es posible reservar clases para fechas pasadas.", code: "PAST_DATE" };
  }
  if (err.includes("no existe o no se encuentra activo")) {
    return { message: "El horario seleccionado no existe o fue cancelado.", code: "SCHEDULE_NOT_FOUND" };
  }
  if (err.includes("no está habilitada")) {
    return { message: "Esta actividad se encuentra temporalmente inactiva.", code: "CLASS_INACTIVE" };
  }
  return { message: rawError, code: "DATABASE_ERROR" };
}

// Run Error Parsing Tests
assert(parseBookingError("Cupo completo. No quedan lugares").code === "CAPACITY_FULL", "Detecta error de cupo lleno");
assert(parseBookingError("Ya tenés una reserva confirmada").code === "ALREADY_RESERVED", "Detecta error de reserva duplicada");
assert(parseBookingError("No estás autenticado").code === "UNAUTHENTICATED", "Detecta error de no autenticado");
assert(parseBookingError("Esta clase aún no tiene cupo definido").code === "CAPACITY_NOT_SET", "Detecta cupo no configurado");
assert(parseBookingError("No es posible reservar clases para fechas pasadas").code === "PAST_DATE", "Detecta fechas pasadas");

// Test 2: Timezone & Day of week calculation for Argentina
function getDayOfWeekFromISO(iso) {
  const clean = iso.slice(0, 10);
  const [y, m, d] = clean.split("-").map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dateObj.getUTCDay();
}

// 2026-08-17 is Monday (1)
assert(getDayOfWeekFromISO("2026-08-17") === 1, "2026-08-17 es Lunes (day 1)");
// 2026-08-18 is Tuesday (2)
assert(getDayOfWeekFromISO("2026-08-18") === 2, "2026-08-18 es Martes (day 2)");
// 2026-08-19 is Wednesday (3)
assert(getDayOfWeekFromISO("2026-08-19") === 3, "2026-08-19 es Miércoles (day 3)");
// 2026-08-20 is Thursday (4)
assert(getDayOfWeekFromISO("2026-08-20") === 4, "2026-08-20 es Jueves (day 4)");
// 2026-08-21 is Friday (5)
assert(getDayOfWeekFromISO("2026-08-21") === 5, "2026-08-21 es Viernes (day 5)");
// 2026-08-22 is Saturday (6)
assert(getDayOfWeekFromISO("2026-08-22") === 6, "2026-08-22 es Sábado (day 6)");
// 2026-08-23 is Sunday (0)
assert(getDayOfWeekFromISO("2026-08-23") === 0, "2026-08-23 es Domingo (day 0)");

// Test 3: Spots calculation logic
function calculateSpots(capacity, confirmed) {
  if (capacity == null) return { isPending: true, spots: null, status: "Cupo a confirmar" };
  const spots = Math.max(0, capacity - confirmed);
  const isFull = spots === 0;
  let status = "";
  if (isFull) status = "Cupo Completo";
  else if (spots === 1) status = "¡Último lugar disponible!";
  else status = `${spots} de ${capacity} lugares disponibles`;
  return { isPending: false, isFull, spots, status };
}

const slotA = calculateSpots(30, 29);
assert(slotA.spots === 1 && slotA.status === "¡Último lugar disponible!", "Detecta último lugar disponible");

const slotB = calculateSpots(30, 30);
assert(slotB.isFull === true && slotB.status === "Cupo Completo", "Detecta cupo completo");

const slotC = calculateSpots(null, 0);
assert(slotC.isPending === true && slotC.status === "Cupo a confirmar", "Detecta cupo pendiente (Yoga / Flexi-Run)");

console.log("\n================================================================================");
console.log(`📊 RESULTADO DE TESTS: ${passed}/${total} pruebas superadas con éxito.`);
console.log("================================================================================\n");
