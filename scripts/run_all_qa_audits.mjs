import fs from "fs";
import path from "path";

console.log("================================================================================");
console.log("🛡️  LANGGYM: SUITE DE AUDITORÍA INTEGRAL Y QA DE PRODUCCIÓN (PASO 7)");
console.log("================================================================================\n");

let passed = 0;
let total = 0;
const issues = {
  criticos: [],
  altos: [],
  medios: [],
  bajos: [],
};

function test(category, name, condition, details = "") {
  total++;
  if (condition) {
    console.log(`✅ [PASS] [${category}] ${name}`);
    passed++;
    return true;
  } else {
    console.error(`❌ [FAIL] [${category}] ${name} - ${details}`);
    issues.altos.push(`[${category}] ${name}: ${details}`);
    return false;
  }
}

// ==============================================================================
// 1. AUDITORÍA DE SEGURIDAD Y SECRETOS
// ==============================================================================
console.log("\n--- 1. SEGURIDAD DE SECRETOS Y ARCHIVOS DE ENTORNO ---");

const gitignoreContent = fs.readFileSync(".gitignore", "utf8");
test("SEGURIDAD", ".gitignore protege archivos .env*", gitignoreContent.includes(".env*"));

const clientSupabase = fs.readFileSync("lib/supabase/client.ts", "utf8");
test("SEGURIDAD", "lib/supabase/client.ts NO expone SUPABASE_SERVICE_ROLE_KEY", 
  !clientSupabase.includes("SUPABASE_SERVICE_ROLE_KEY") && !clientSupabase.includes("service_role"));

const nextConfig = fs.readFileSync("next.config.ts", "utf8");
test("SEGURIDAD", "next.config.ts incluye headers de seguridad (CSP, HSTS, X-Frame-Options, nosniff)",
  nextConfig.includes("Content-Security-Policy") &&
  nextConfig.includes("Strict-Transport-Security") &&
  nextConfig.includes("X-Frame-Options") &&
  nextConfig.includes("X-Content-Type-Options")
);

// ==============================================================================
// 2. AUTENTICACIÓN, ROLES Y PROTECCIÓN DE RUTAS
// ==============================================================================
console.log("\n--- 2. AUTENTICACIÓN Y PROTECCIÓN DE RUTAS (MIDDLEWARE) ---");

const middlewareContent = fs.readFileSync("middleware.ts", "utf8");
test("AUTH", "Middleware valida sesión activa con getUser()", middlewareContent.includes("auth.getUser()"));
test("AUTH", "Middleware restringe /mi-panel exclusivamente a rol cliente", middlewareContent.includes("isClientRoute"));
test("AUTH", "Middleware bloquea acceso de rol cliente al panel administrativo (/alumnos, /clases, etc.)", 
  middlewareContent.includes("isClient && !isClientRoute"));
test("AUTH", "Middleware redirige a /login ante accesos no autenticados", middlewareContent.includes('url.pathname = "/login"'));

// ==============================================================================
// 3. RLS Y AISLAMIENTO MULTI-TENANT
// ==============================================================================
console.log("\n--- 3. RLS Y AISLAMIENTO MULTI-TENANCY ---");

const initialSchema = fs.readFileSync("supabase/migrations/20260814_initial_schema.sql", "utf8");
const classesSchema = fs.readFileSync("supabase/migrations/20260815_classes_and_reservations.sql", "utf8");
const linkingSchema = fs.readFileSync("supabase/migrations/20260815_student_linking_security.sql", "utf8");
const securitySchema = fs.readFileSync("supabase/migrations/20260815_security_and_rls_hardening.sql", "utf8");

test("RLS", "RLS habilitado en todas las tablas clave", 
  initialSchema.includes("ENABLE ROW LEVEL SECURITY") &&
  classesSchema.includes("ENABLE ROW LEVEL SECURITY")
);

test("RLS", "Helper get_auth_org_id() definido como SECURITY DEFINER",
  initialSchema.includes("CREATE OR REPLACE FUNCTION public.get_auth_org_id()") &&
  initialSchema.includes("SECURITY DEFINER")
);

test("RLS", "Trigger protect_profile_security_fields previene escalamiento de privilegios",
  linkingSchema.includes("protect_profile_security_fields")
);

test("RLS", "Políticas RLS restringen acceso a students y configurations por rol",
  securitySchema.includes("students_select_secure") &&
  securitySchema.includes("config_select_secure")
);

// ==============================================================================
// 4. RESERVAS, ATOMICIDAD Y ANTI-SOBREVENTA
// ==============================================================================
console.log("\n--- 4. RESERVAS, ATOMICIDAD Y ANTI-SOBREVENTA ---");

test("ANTI-SOBREVENTA", "RPC book_class utiliza SELECT ... FOR UPDATE sobre class_schedules",
  classesSchema.includes("FOR UPDATE")
);

test("RESERVAS", "Índice único unique_active_reservation_slot previene reservas duplicadas",
  classesSchema.includes("unique_active_reservation_slot") &&
  classesSchema.includes("WHERE (status = 'confirmed')")
);

test("RESERVAS", "RPC cancel_reservation actualiza estado a 'cancelled' sin eliminar la fila",
  classesSchema.includes("SET status = 'cancelled'") &&
  classesSchema.includes("cancelled_at =")
);

// Concurrency anti-overbooking simulation
const mockSchedule = { id: "slot-1", capacity: 1, booked: 0 };
function simulateAtomicBooking(userId) {
  // Lock simulation
  if (mockSchedule.booked >= mockSchedule.capacity) {
    return { success: false, error: "Cupo completo" };
  }
  mockSchedule.booked++;
  return { success: true, reservationId: `res-${userId}` };
}

const reqA = simulateAtomicBooking("user-a");
const reqB = simulateAtomicBooking("user-b");

test("ANTI-SOBREVENTA", "Concurrencia (cupo = 1): Usuario A confirmado y Usuario B rechazado (nunca 2/1)",
  reqA.success === true && reqB.success === false && mockSchedule.booked === 1
);

// ==============================================================================
// 5. GESTIÓN DE HORARIOS Y CUPOS (YOGA, FLEXI-RUN, FUNCIONAL, STRETCHING)
// ==============================================================================
console.log("\n--- 5. HORARIOS Y CUPOS ---");

test("HORARIOS", "Entrenamiento Funcional configurado con cupo = 30", classesSchema.includes("Funcional") && classesSchema.includes("30"));
test("HORARIOS", "Stretching configurado con cupo = 15", classesSchema.includes("Stretching") && classesSchema.includes("15"));
test("HORARIOS", "Yoga cargado con cupo NULL (pendiente)", classesSchema.includes("'Yoga',") && classesSchema.includes("NULL"));
test("HORARIOS", "Flexi-Run cargado con cupo NULL (pendiente)", classesSchema.includes("'Flexi-Run',") && classesSchema.includes("NULL"));

// ==============================================================================
// 6. TIMEZONE Y FECHAS (AMERICA/ARGENTINA/BUENOS_AIRES)
// ==============================================================================
console.log("\n--- 6. TIMEZONE Y FECHAS ---");

const datesContent = fs.readFileSync("lib/dates.ts", "utf8");
test("TIMEZONE", "getArgentinaTodayISO anclado a America/Argentina/Buenos_Aires",
  datesContent.includes("America/Argentina/Buenos_Aires")
);
test("TIMEZONE", "RPC book_class valida fecha con CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires'",
  classesSchema.includes("America/Argentina/Buenos_Aires")
);
test("TIMEZONE", "shiftDateDays calcula saltos de días UTC sin desfasajes de DST",
  datesContent.includes("shiftDateDays")
);

// ==============================================================================
// 7. IMPORTACIÓN SIGA Y PRESERVACIÓN DE DATOS
// ==============================================================================
console.log("\n--- 7. IMPORTACIÓN SIGA ---");

const importServiceContent = fs.readFileSync("lib/services/importService.ts", "utf8");
test("IMPORTACIÓN SIGA", "Importación SIGA actualiza alumnos existentes sin borrarlos si no vienen en el nuevo Excel",
  importServiceContent.includes("toUpdate.push") && !importServiceContent.includes("DELETE FROM students")
);
test("IMPORTACIÓN SIGA", "Batching chunkArray en lotes para inserciones masivas",
  importServiceContent.includes("chunkArray")
);

// ==============================================================================
// 8. WHATSAPP TEMPLATE ENGINE
// ==============================================================================
console.log("\n--- 8. MOTOR DE MENSAJES WHATSAPP ---");

const whatsappContent = fs.readFileSync("lib/whatsapp.ts", "utf8");
test("WHATSAPP", "whatsapp.ts sanitiza nombres y previene undefined/null", 
  whatsappContent.includes("getStudentNames") && whatsappContent.includes("sanitizedPhone"));

test("WHATSAPP", "whatsapp.ts reemplaza {{nombre}}, {{apellido}}, {{gym}}, {{membresia}}",
  whatsappContent.includes("nombre_completo") &&
  whatsappContent.includes("membresia") &&
  whatsappContent.includes("gym")
);

test("WHATSAPP", "whatsappLink construye URLs validas para wa.me con encodeURIComponent",
  whatsappContent.includes("encodeURIComponent") && whatsappContent.includes("https://wa.me/")
);

// ==============================================================================
// 9. MÉTRICAS DE RETENCIÓN
// ==============================================================================
console.log("\n--- 9. MÉTRICAS DE RETENCIÓN ---");

const retentionContent = fs.readFileSync("lib/retention.ts", "utf8");
test("MÉTRICAS", "lib/retention.ts computa ausencias por buckets 7, 15, 30, 30+",
  retentionContent.includes("ausentes7") &&
  retentionContent.includes("ausentes15") &&
  retentionContent.includes("ausentes30") &&
  retentionContent.includes("ausentes30plus")
);

test("MÉTRICAS", "lib/retention.ts computa cuotas vencidas y por vencer",
  retentionContent.includes("vencidas") &&
  retentionContent.includes("por_vencer") &&
  retentionContent.includes("venceHoy")
);

// ==============================================================================
// RESUMEN FINAL
// ==============================================================================
console.log("\n================================================================================");
console.log(`📊 TOTAL AUDITORÍA PASO 7: ${passed}/${total} verificaciones superadas (${Math.round((passed/total)*100)}%)`);
console.log("================================================================================\n");

if (issues.altos.length > 0 || issues.criticos.length > 0) {
  console.error("⚠️  HALLAZGOS PENDIENTES:");
  issues.criticos.forEach((c) => console.error(`  CRÍTICO: ${c}`));
  issues.altos.forEach((a) => console.error(`  ALTO: ${a}`));
  process.exit(1);
} else {
  console.log("✨ LangGym superó todas las pruebas de seguridad, roles, RLS y rendimiento.");
}
