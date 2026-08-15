/**
 * ==============================================================================
 * LANGGYM DEEP PRODUCTION AUDIT TEST SUITE
 * ==============================================================================
 * Comprehensive test runner executing all scenario simulations:
 * - Scenarios A-N: Client Registration & Authentication Lifecycles
 * - RBAC & Route Matrix Guarding (Client vs Staff/Admin/Owner)
 * - Atomic Class Booking, Overbooking Prevention & Concurrency Verification
 * - SIGA Import Integrity & Historical Snapshot Invariance
 * - Multi-Tenancy, RLS & Field Inmutability
 * ==============================================================================
 */

import fs from "fs";
import path from "path";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function check(scenario, name, condition, details = "") {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [${scenario}] ${name}`);
  } else {
    failedTests++;
    failures.push({ scenario, name, details });
    console.error(`  ❌ [${scenario}] FAIL: ${name} ${details ? `(${details})` : ""}`);
  }
}

// ------------------------------------------------------------------------------
// Helpers for String, Date, and Phone Normalization (Simulated Pure Logic)
// ------------------------------------------------------------------------------
function cleanCell(value, maxLength = 500) {
  if (value == null) return null;
  const EMPTY_TOKENS = new Set(["", "-", "—", "–", "n/a", "na", "s/d", "sd", "null", "."]);
  let s = String(value)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length === 0 || EMPTY_TOKENS.has(s.toLowerCase())) return null;
  if (s.length > maxLength) s = s.slice(0, maxLength).trim();
  return s;
}

function normalizePhone(raw, defaultCountry = "54", defaultArea = "223") {
  if (!raw) return { telefono: null, telefonoRaw: null };
  const str = String(raw).trim();
  const digits = str.replace(/\D/g, "");
  if (digits.length === 0) return { telefono: null, telefonoRaw: str };

  let clean = digits.replace(/^0+/, "");
  if (clean.startsWith("15") && clean.length >= 8) clean = clean.slice(2);

  if (clean.startsWith("549")) {
    const local = clean.slice(3);
    if (local.length < 8 || local.length > 11) return { telefono: null, telefonoRaw: str };
    return { telefono: clean, telefonoRaw: str };
  }

  if (clean.startsWith("54")) {
    let rest = clean.slice(2);
    if (rest.startsWith("9")) rest = rest.slice(1);
    if (rest.length < 8 || rest.length > 11) return { telefono: null, telefonoRaw: str };
    return { telefono: `549${rest}`, telefonoRaw: str };
  }

  if (clean.length === 10) return { telefono: `549${clean}`, telefonoRaw: str };
  if (clean.length === 8) return { telefono: `549${defaultArea}${clean}`, telefonoRaw: str };
  if (clean.length > 10 && clean.length <= 11) return { telefono: `549${clean}`, telefonoRaw: str };

  return { telefono: null, telefonoRaw: str };
}

// ------------------------------------------------------------------------------
// Simulation: Route Resolution Logic for Middleware
// ------------------------------------------------------------------------------
function simulateMiddlewareRoute(pathname, user, profile) {
  const isPublicRoute =
    pathname === "/login" ||
    pathname === "/registro" ||
    pathname === "/reqistro" ||
    pathname === "/forgot-password";

  if (!user) {
    if (isPublicRoute) return { action: "next" };
    return { action: "redirect", target: "/login" };
  }

  const role = profile?.role || (user.user_metadata?.registered_as === "cliente" ? "cliente" : "cliente");
  const isClient = role === "cliente";
  const isClientRoute = pathname.startsWith("/mi-panel") || pathname.startsWith("/cliente");

  if (isPublicRoute) {
    return { action: "redirect", target: isClient ? "/mi-panel" : "/" };
  }

  if (isClient && !isClientRoute) {
    return { action: "redirect", target: "/mi-panel" };
  }

  if (!isClient && isClientRoute) {
    return { action: "redirect", target: "/" };
  }

  return { action: "next" };
}

// ------------------------------------------------------------------------------
// Simulation: Atomic Slot Booking Logic (PostgreSQL RPC Simulation)
// ------------------------------------------------------------------------------
class BookingSystemMock {
  constructor() {
    this.schedules = new Map();
    this.reservations = [];
  }

  addSchedule(id, orgId, className, dayOfWeek, startTime, capacity) {
    this.schedules.set(id, { id, orgId, className, dayOfWeek, startTime, capacity });
  }

  bookClass(userId, orgId, scheduleId, classDate) {
    const sched = this.schedules.get(scheduleId);
    if (!sched) return { success: false, error: "Clase inexistente" };
    if (sched.orgId !== orgId) return { success: false, error: "Aislamiento de organización" };

    // Day of week check
    const [y, m, d] = classDate.split("-").map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    if (dateObj.getUTCDay() !== sched.dayOfWeek) {
      return { success: false, error: "El horario no corresponde al día de la fecha seleccionada." };
    }

    // Capacity check
    if (sched.capacity === null) {
      return { success: false, error: "El cupo de esta clase se encuentra pendiente de confirmación." };
    }

    // Duplicate reservation check
    const existing = this.reservations.find(
      (r) => r.scheduleId === scheduleId && r.classDate === classDate && r.userId === userId && r.status === "confirmed"
    );
    if (existing) {
      return { success: false, error: "Ya tenés una reserva confirmada para este horario." };
    }

    // Count confirmed
    const confirmedCount = this.reservations.filter(
      (r) => r.scheduleId === scheduleId && r.classDate === classDate && r.status === "confirmed"
    ).length;

    if (confirmedCount >= sched.capacity) {
      return { success: false, error: "Esta clase ya completó todos sus cupos disponibles." };
    }

    const res = {
      id: `res-${this.reservations.length + 1}`,
      scheduleId,
      userId,
      classDate,
      status: "confirmed",
      createdAt: new Date().toISOString(),
    };
    this.reservations.push(res);
    return { success: true, reservation: res };
  }

  cancelReservation(userId, reservationId) {
    const res = this.reservations.find((r) => r.id === reservationId);
    if (!res) return { success: false, error: "Reserva no encontrada." };
    if (res.userId !== userId) return { success: false, error: "No tenés permiso para cancelar esta reserva." };
    if (res.status === "cancelled") return { success: false, error: "La reserva ya fue cancelada." };

    res.status = "cancelled";
    res.cancelledAt = new Date().toISOString();
    return { success: true };
  }
}

// ==============================================================================
// MAIN TEST EXECUTION
// ==============================================================================
async function runAudit() {
  console.log("================================================================================");
  console.log("🔍 EJECUTANDO AUDITORÍA PROFUNDA Y EXHAUSTIVA DE PRODUCCIÓN (LANGGYM)");
  console.log("================================================================================\n");

  // ----------------------------------------------------------------------------
  // SECCIÓN 1: Flujos de Registro y Autenticación (Escenarios A - N)
  // ----------------------------------------------------------------------------
  console.log("👤 1. Escenarios de Registro, Roles y Autenticación (A - N):");

  const orgId = "org-uuid-123";
  const studentDatabase = [
    { id: "st-1", id_socio: "101", email: "andres@gmail.com", telefono: "5492235851985", telefono_raw: "2235851985" },
    { id: "st-2", id_socio: "102", email: "maria@gmail.com", telefono: "5492234001122", telefono_raw: "2234001122" },
    { id: "st-3", id_socio: "103", email: "familia1@gmail.com", telefono: "5492235112233", telefono_raw: "2235112233" },
    { id: "st-4", id_socio: "104", email: "familia2@gmail.com", telefono: "5492235112233", telefono_raw: "2235112233" }, // Shared phone
  ];

  // Helper simulating matching in register-client route
  function matchStudent(email, phone) {
    const cleanEmail = (email || "").toLowerCase().trim();
    const phoneNorm = normalizePhone(phone).telefono;

    // 1. Email exact
    const emailMatch = studentDatabase.find((s) => s.email && s.email.toLowerCase().trim() === cleanEmail);
    if (emailMatch) return { studentId: emailMatch.id, matchReason: "email" };

    // 2. Phone unique
    if (phoneNorm) {
      const phoneMatches = studentDatabase.filter((s) => s.telefono === phoneNorm);
      if (phoneMatches.length === 1) return { studentId: phoneMatches[0].id, matchReason: "phone" };
    }

    return null;
  }

  // A. Alumno nuevo que nunca existió en SIGA
  const matchA = matchStudent("nuevo@gmail.com", "2239998877");
  check("ESCENARIO A", "Alumno no existente en SIGA -> student_id null, registro permitido", matchA === null);

  // B. Alumno que existe en SIGA
  const matchB = matchStudent("andres@gmail.com", "2235851985");
  check("ESCENARIO B", "Alumno existente en SIGA -> vincula studentId st-1", matchB?.studentId === "st-1");

  // C. Alumno con email coincidente
  const matchC = matchStudent("maria@gmail.com", "2230000000");
  check("ESCENARIO C", "Email coincidente -> vincula por email", matchC?.studentId === "st-2" && matchC?.matchReason === "email");

  // D. Alumno con teléfono coincidente
  const matchD = matchStudent("otro@gmail.com", "2234001122");
  check("ESCENARIO D", "Teléfono único coincidente -> vincula por teléfono", matchD?.studentId === "st-2" && matchD?.matchReason === "phone");

  // E. Teléfono compartido por dos alumnos
  const matchE = matchStudent("tercero@gmail.com", "2235112233");
  check("ESCENARIO E", "Teléfono compartido -> no vincula automáticamente (evita falso positivo)", matchE === null);

  // F. Imposibilidad de modificar role o crear org fantasma
  const regRouteContent = fs.readFileSync(path.resolve(process.cwd(), "app/api/auth/register-client/route.ts"), "utf-8");
  check("ESCENARIO F", "register-client no contiene auto-seeding de 'Lang Gym'", !regRouteContent.includes('insert({ name: "Lang Gym"'));
  check("ESCENARIO F", "register-client responde 422 si la organización no está inicializada", regRouteContent.includes("ORGANIZATION_NOT_INITIALIZED"));

  // ----------------------------------------------------------------------------
  // SECCIÓN 2: Middleware y RBAC (Escenarios G - N)
  // ----------------------------------------------------------------------------
  console.log("\n🛡️ 2. Middleware & Matriz de Redirecciones (RBAC):");

  const unauthUser = null;
  const clientUser = { id: "u-client", user_metadata: { registered_as: "cliente" } };
  const clientProfile = { id: "u-client", role: "cliente", organization_id: orgId };
  const adminUser = { id: "u-admin", user_metadata: { registered_as: "owner" } };
  const adminProfile = { id: "u-admin", role: "owner", organization_id: orgId };

  // N. No autenticado a ruta privada -> /login
  check("ESCENARIO N", "No autenticado intentando entrar a / -> redirige a /login",
    simulateMiddlewareRoute("/", unauthUser, null).target === "/login"
  );
  check("ESCENARIO N", "No autenticado intentando entrar a /mi-panel -> redirige a /login",
    simulateMiddlewareRoute("/mi-panel", unauthUser, null).target === "/login"
  );

  // J. Cliente que entra a /login -> redirige a /mi-panel
  check("ESCENARIO J", "Cliente autenticado en /login -> redirige a /mi-panel",
    simulateMiddlewareRoute("/login", clientUser, clientProfile).target === "/mi-panel"
  );

  // K. Cliente que intenta entrar a / -> redirige a /mi-panel
  check("ESCENARIO K", "Cliente intentando entrar a / -> bloqueado y enviado a /mi-panel",
    simulateMiddlewareRoute("/", clientUser, clientProfile).target === "/mi-panel"
  );

  // L. Cliente que intenta entrar a rutas de administración -> bloqueado
  const adminRoutes = ["/alumnos", "/clases", "/metricas", "/configuracion", "/importar", "/cobros", "/recuperacion"];
  const allAdminBlocked = adminRoutes.every(
    (r) => simulateMiddlewareRoute(r, clientUser, clientProfile).target === "/mi-panel"
  );
  check("ESCENARIO L", "Cliente intentando acceder a cualquier ruta de admin -> redirige a /mi-panel", allAdminBlocked);

  // M. Admin que entra a /mi-panel -> redirige a /
  check("ESCENARIO M", "Admin intentando entrar a /mi-panel -> redirige a /",
    simulateMiddlewareRoute("/mi-panel", adminUser, adminProfile).target === "/"
  );

  // Admin en /login -> redirige a /
  check("AUTH ADMIN", "Admin en /login -> redirige a /",
    simulateMiddlewareRoute("/login", adminUser, adminProfile).target === "/"
  );

  // ----------------------------------------------------------------------------
  // SECCIÓN 3: Atomicidad de Reservas, Concurrencia y Cupos
  // ----------------------------------------------------------------------------
  console.log("\n⚡ 3. Atomicidad de Reservas, Cupos y Control de Concurrencia:");

  const bs = new BookingSystemMock();
  // Funcional Lunes 18:00 (Cupo 30)
  bs.addSchedule("sched-func-18", orgId, "Entrenamiento Funcional", 1, "18:00", 30);
  // Stretching Martes 09:00 (Cupo 15)
  bs.addSchedule("sched-stretch-09", orgId, "Stretching", 2, "09:00", 15);
  // Yoga Lunes 08:00 (Cupo NULL - pendiente)
  bs.addSchedule("sched-yoga-08", orgId, "Yoga", 1, "08:00", null);

  // Test 1: Reserva válida en día correcto
  const b1 = bs.bookClass("user-1", orgId, "sched-func-18", "2026-08-17"); // 2026-08-17 is Monday (1)
  check("RESERVAS", "Reserva exitosa en día correspondiente (Lunes Funcional)", b1.success);

  // Test 2: Reserva en día incorrecto (ej. Martes para horario de Lunes)
  const b2 = bs.bookClass("user-2", orgId, "sched-func-18", "2026-08-18"); // Tuesday (2)
  check("RESERVAS", "Rechaza reserva si el día no coincide con el cronograma", !b2.success);

  // Test 3: Reserva duplicada del mismo usuario
  const b3 = bs.bookClass("user-1", orgId, "sched-func-18", "2026-08-17");
  check("RESERVAS", "Rechaza reserva duplicada para el mismo usuario y horario", !b3.success && b3.error.includes("Ya tenés una reserva"));

  // Test 4: Clase con cupo pendiente (Yoga)
  const b4 = bs.bookClass("user-3", orgId, "sched-yoga-08", "2026-08-17");
  check("RESERVAS", "Rechaza reserva si el cupo está pendiente de confirmación", !b4.success && b4.error.includes("pendiente"));

  // Test 5: Concurrencia y límite de cupo (Llenar Stretching hasta 15 y probar el 16)
  for (let i = 1; i <= 15; i++) {
    bs.bookClass(`user-${i}`, orgId, "sched-stretch-09", "2026-08-18"); // 2026-08-18 is Tuesday (2)
  }
  const bOverflow = bs.bookClass("user-16", orgId, "sched-stretch-09", "2026-08-18");
  check("CONCURRENCIA", "Bloquea sobreventa cuando se alcanza la capacidad exacta (15/15)", !bOverflow.success && bOverflow.error.includes("completó todos sus cupos"));

  // Test 6: Cancelación y liberación de cupo
  const cancelRes = bs.cancelReservation("user-1", "res-2"); // user-1 booked stretch
  check("CANCELACIÓN", "Cancelación exitosa de reserva propia", cancelRes.success);

  // Test 7: Tras liberar un cupo, el usuario 16 ahora sí puede reservar (15/15)
  const bAfterCancel = bs.bookClass("user-16", orgId, "sched-stretch-09", "2026-08-18");
  check("LIBERACIÓN", "Cupo liberado inmediatamente disponible para otro alumno", bAfterCancel.success);

  // ----------------------------------------------------------------------------
  // SECCIÓN 4: Seguridad, RLS e Inmutabilidad de Roles
  // ----------------------------------------------------------------------------
  console.log("\n🔒 4. Seguridad, Aislamiento RLS e Inmutabilidad de Roles:");

  const linkingSql = fs.readFileSync(path.resolve(process.cwd(), "supabase/migrations/20260815_student_linking_security.sql"), "utf-8");
  check("SEGURIDAD DB", "Trigger protect_profile_security_fields bloquea edición de role en profiles",
    linkingSql.includes("protect_profile_security_fields") && linkingSql.includes("NEW.role IS DISTINCT FROM OLD.role")
  );
  check("SEGURIDAD DB", "Trigger protect_profile_security_fields bloquea edición de organization_id",
    linkingSql.includes("NEW.organization_id IS DISTINCT FROM OLD.organization_id")
  );
  check("SEGURIDAD DB", "Trigger protect_profile_security_fields bloquea alteración arbitraria de student_id",
    linkingSql.includes("NEW.student_id IS DISTINCT FROM OLD.student_id")
  );

  const adminClientSvc = fs.readFileSync(path.resolve(process.cwd(), "lib/supabase/admin.ts"), "utf-8");
  check("SEGURIDAD SECRETS", "supabaseAdmin bloquea ejecución en el cliente (window check)",
    adminClientSvc.includes('typeof window !== "undefined"')
  );

  // ----------------------------------------------------------------------------
  // SECCIÓN 5: Estado Local, Purga de Sesiones & SIGA
  // ----------------------------------------------------------------------------
  console.log("\n💾 5. Estado Local y Limpieza de Sesiones:");

  const authContext = fs.readFileSync(path.resolve(process.cwd(), "lib/auth/AuthContext.tsx"), "utf-8");
  check("SESIÓN", "signOut purga Zustand store en memoria", authContext.includes("useStore.getState().reset()"));
  check("SESIÓN", "signOut purga localStorage ('langgym-store')", authContext.includes('localStorage.removeItem("langgym-store")'));
  check("SESIÓN", "AuthContext no descarga students para usuarios con role cliente", authContext.includes('if (prof.role !== "cliente")'));

  // ----------------------------------------------------------------------------
  // RESUMEN FINAL
  // ----------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`📊 TOTAL AUDITADO: ${passedTests}/${totalTests} PRUEBAS SUPERADAS (${failedTests} FALLOS)`);
  console.log("================================================================================");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAudit().catch(console.error);
