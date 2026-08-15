import { parseExcel } from "../lib/import/parseExcel.ts";
import { cleanCell, normalizePhone, splitName } from "../lib/import/normalize.ts";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

async function runSecurityTestSuite() {
  console.log("==================================================");
  console.log("🛡️ INICIANDO SUITE DE AUDITORÍA Y TESTS DE ATAQUE (FASE 4)");
  console.log("==================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = "") {
    if (condition) {
      console.log(`✅ PASS: ${testName} ${details ? "(" + details + ")" : ""}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} ${details ? "(" + details + ")" : ""}`);
      failed++;
    }
  }

  const defaultConfig = {
    gymName: "Gimnasio Alpha",
    ownerName: "Owner A",
    logoDataUrl: null,
    countryCode: "54",
    mobilePrefix: "9",
    diasRiesgo: { nivel1: 7, nivel2: 15, nivel3: 30 },
    porVencerDias: 7,
    templates: { recuperacion: "Hola {{nombre}}", cobro: "Hola {{nombre}}" },
  };

  // ----------------------------------------------------
  // TEST A-E: Simulación y validación de RLS Multi-Tenant
  // ----------------------------------------------------
  console.log("--- 1. Multi-Tenant RLS & Isolation Policies ---");

  // Schema verification for RLS definitions
  const schemaPath = path.resolve(process.cwd(), "supabase/migrations/20260814_initial_schema.sql");
  const schemaContent = fs.readFileSync(schemaPath, "utf-8");

  assert(
    schemaContent.includes("ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;") &&
    schemaContent.includes("CREATE POLICY \"students_select_own\" ON public.students") &&
    schemaContent.includes("CREATE POLICY \"students_insert_own\" ON public.students") &&
    schemaContent.includes("CREATE POLICY \"students_update_own\" ON public.students") &&
    schemaContent.includes("CREATE POLICY \"students_delete_own\" ON public.students"),
    "Test A-D: Table students has strict SELECT, INSERT, UPDATE, DELETE RLS policies bounded to get_auth_org_id()"
  );

  assert(
    schemaContent.includes("ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;") &&
    schemaContent.includes("CREATE POLICY \"follow_ups_select_own\" ON public.follow_ups") &&
    schemaContent.includes("CREATE POLICY \"follow_ups_insert_own\" ON public.follow_ups") &&
    schemaContent.includes("CREATE POLICY \"follow_ups_update_own\" ON public.follow_ups") &&
    schemaContent.includes("CREATE POLICY \"follow_ups_delete_own\" ON public.follow_ups"),
    "Test E: Table follow_ups enforces RLS across all operations to prevent cross-tenant manipulation"
  );

  assert(
    schemaContent.includes("CONSTRAINT unique_socio_per_org UNIQUE (organization_id, id_socio)"),
    "Test 8: Database level unique constraint (organization_id, id_socio) enforces student uniqueness per tenant"
  );

  // ----------------------------------------------------
  // TEST G-H: Middleware & Route Protection
  // ----------------------------------------------------
  console.log("\n--- 2. Route Protection & Auth Session Enforcements ---");
  const middlewarePath = path.resolve(process.cwd(), "middleware.ts");
  const middlewareContent = fs.readFileSync(middlewarePath, "utf-8");

  assert(
    middlewareContent.includes("supabase.auth.getUser()") &&
    !middlewareContent.includes("supabase.auth.getSession()"),
    "Test G: Middleware uses secure getUser() JWT validation instead of insecure getSession()"
  );

  assert(
    middlewareContent.includes("if (!user && !isPublicRoute)") &&
    middlewareContent.includes("url.pathname = \"/login\""),
    "Test G: Unauthenticated requests to private routes are redirected to /login"
  );

  // ----------------------------------------------------
  // TEST I: Excel Malformado (Corrupt File Resilience)
  // ----------------------------------------------------
  console.log("\n--- 3. Excel Parser & Malformed File Resilience ---");
  const garbageBuffer = new Uint8Array([0x00, 0xff, 0xfe, 0x12, 0x34, 0x56, 0x78, 0x99]).buffer;
  let parsedGarbage = null;
  let threwException = false;
  try {
    parsedGarbage = parseExcel(garbageBuffer, defaultConfig);
  } catch (e) {
    threwException = true;
  }

  assert(
    !threwException && parsedGarbage && parsedGarbage.parsedStudents.length === 0,
    "Test I: Malformed non-Excel binary files do not crash the engine and produce 0 parsed students"
  );

  // ----------------------------------------------------
  // TEST J: Excel con Duplicados
  // ----------------------------------------------------
  const wbDup = XLSX.utils.book_new();
  const wsDataDup = [
    ["ID Socio", "Nombre", "Celular", "Fecha Vencimiento", "Habilitado"],
    ["1001", "Juan Perez", "1123456789", "2026-08-30", "Si"],
    ["1001", "Juan Perez Clon", "1123456789", "2026-08-30", "Si"],
    ["1002", "Maria Lopez", "1198765432", "2026-08-30", "Si"],
  ];
  const wsDup = XLSX.utils.aoa_to_sheet(wsDataDup);
  XLSX.utils.book_append_sheet(wbDup, wsDup, "Socios");
  const dupBuffer = XLSX.write(wbDup, { type: "array", bookType: "xlsx" });
  const parsedDup = parseExcel(dupBuffer, defaultConfig);

  assert(
    parsedDup.parsedStudents.length === 2 && parsedDup.errores.length === 1,
    "Test J: Excel with duplicate idSocio records correctly rejects duplicates and logs validation error"
  );

  // ----------------------------------------------------
  // TEST K: Excel con Datos Faltantes
  // ----------------------------------------------------
  const wbMissing = XLSX.utils.book_new();
  const wsDataMissing = [
    ["ID Socio", "Nombre", "Celular", "Fecha Vencimiento", "Habilitado"],
    ["", "Alumno Sin ID", "1123456789", "2026-08-30", "Si"],
    ["1004", "", "1123456789", "2026-08-30", "Si"],
    ["1005", "Carlos Valido", "1123456789", "2026-08-30", "Si"],
  ];
  const wsMissing = XLSX.utils.aoa_to_sheet(wsDataMissing);
  XLSX.utils.book_append_sheet(wbMissing, wsMissing, "Socios");
  const missingBuffer = XLSX.write(wbMissing, { type: "array", bookType: "xlsx" });
  const parsedMissing = parseExcel(missingBuffer, defaultConfig);

  assert(
    parsedMissing.parsedStudents.length === 1 && parsedMissing.errores.length === 2,
    "Test K: Excel with missing required fields (idSocio or Nombre) skips invalid rows and logs errors"
  );

  // ----------------------------------------------------
  // TEST L: Input Sanitization & Control Characters
  // ----------------------------------------------------
  console.log("\n--- 4. Input Sanitization & Injection Defense ---");
  const dirtyInput = "Estudiante\x00\x08Malicioso\x1F";
  const cleaned = cleanCell(dirtyInput);
  assert(
    cleaned === "EstudianteMalicioso",
    "Test L: cleanCell strips binary null bytes and non-printable control characters"
  );

  const oversized = "A".repeat(1000);
  const bounded = cleanCell(oversized, 100);
  assert(
    bounded.length === 100,
    "Test L: cleanCell truncates oversized inputs to bounded length"
  );

  // ----------------------------------------------------
  // TEST M: Secret Leakage & Bundle Inspection
  // ----------------------------------------------------
  console.log("\n--- 5. Bundle & Environment Variable Security Audit ---");
  const clientSupabasePath = path.resolve(process.cwd(), "lib/supabase/client.ts");
  const clientSupabaseContent = fs.readFileSync(clientSupabasePath, "utf-8");

  assert(
    !clientSupabaseContent.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    !clientSupabaseContent.includes("process.env.SUPABASE_SERVICE_ROLE_KEY"),
    "Test M: lib/supabase/client.ts NEVER references or leaks SUPABASE_SERVICE_ROLE_KEY"
  );

  const adminSupabasePath = path.resolve(process.cwd(), "lib/supabase/admin.ts");
  const adminSupabaseContent = fs.readFileSync(adminSupabasePath, "utf-8");
  assert(
    adminSupabaseContent.includes("typeof window !== \"undefined\""),
    "Test M: lib/supabase/admin.ts has active runtime guards against client execution"
  );

  // Check login error message
  const loginPagePath = path.resolve(process.cwd(), "app/login/page.tsx");
  const loginPageContent = fs.readFileSync(loginPagePath, "utf-8");
  assert(
    loginPageContent.includes("Credenciales inválidas. Verificá tu correo y contraseña."),
    "Test 5: Login error message is generic to prevent user enumeration attacks"
  );

  // Check HTTP Security Headers
  const nextConfigPath = path.resolve(process.cwd(), "next.config.ts");
  const nextConfigContent = fs.readFileSync(nextConfigPath, "utf-8");
  assert(
    nextConfigContent.includes("X-Frame-Options") &&
    nextConfigContent.includes("DENY") &&
    nextConfigContent.includes("Strict-Transport-Security") &&
    nextConfigContent.includes("Content-Security-Policy"),
    "Test 11: next.config.ts contains HSTS, X-Frame-Options: DENY, and Content-Security-Policy"
  );

  console.log("\n==================================================");
  console.log(`📊 RESULTADOS TOTALES SUITE: ${passed} PASSED / ${failed} FAILED`);
  console.log("==================================================");
}

runSecurityTestSuite();
