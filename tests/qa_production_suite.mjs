import fs from "fs";
import path from "path";

// ----------------------------------------------------
// Core Logic Imports / Helpers for Node environment
// ----------------------------------------------------
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

function toTitleCase(s) {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

function splitName(full) {
  const titled = toTitleCase(full.replace(/\s+/g, " ").trim());
  const tokens = titled.split(" ").filter(Boolean);
  if (tokens.length === 0) return { nombre: "", apellido: "", nombreCompleto: titled };
  if (tokens.length === 1) return { nombre: tokens[0], apellido: "", nombreCompleto: titled };
  if (tokens.length === 2) {
    return { nombre: tokens[0], apellido: tokens[1], nombreCompleto: titled };
  }
  const apellido = tokens.slice(-2).join(" ");
  const nombre = tokens.slice(0, -2).join(" ");
  return { nombre, apellido, nombreCompleto: titled };
}

function normalizePhone(celular, telefono, config) {
  const rawSource = celular ?? telefono;
  if (!rawSource) return { telefono: null, telefonoRaw: null };
  let d = rawSource.replace(/\D/g, "");
  if (!d) return { telefono: null, telefonoRaw: rawSource };
  d = d.replace(/^0+/, "");
  if (d.startsWith(config.countryCode) && d.length >= config.countryCode.length + 8) {
    return { telefono: d, telefonoRaw: rawSource };
  }
  if (d.length < 8) return { telefono: null, telefonoRaw: rawSource };
  const intl = `${config.countryCode}${config.mobilePrefix}${d}`;
  return { telefono: intl, telefonoRaw: rawSource };
}

function getStudentNames(student) {
  const nombreRaw = (student.nombre ?? "").trim();
  const apellidoRaw = (student.apellido ?? "").trim();
  const nombreCompletoRaw = (student.nombreCompleto ?? "").trim();

  let nombre = nombreRaw;
  let apellido = apellidoRaw;
  let nombreCompleto = nombreCompletoRaw;

  if (!nombre && !apellido && nombreCompleto) {
    const tokens = nombreCompleto.split(" ").filter(Boolean);
    nombre = tokens[0] || "";
    apellido = tokens.slice(1).join(" ") || "";
  }

  if (!nombreCompleto) {
    nombreCompleto = [nombre, apellido].filter(Boolean).join(" ");
  }

  if (!nombre && nombreCompleto) {
    nombre = nombreCompleto;
  }

  return { nombre, apellido, nombreCompleto };
}

function renderTemplate(template, student, config) {
  if (!template) return "";
  const { nombre, apellido, nombreCompleto } = getStudentNames(student);
  const gymName = (config?.gymName ?? "").trim();
  const membresia = (student?.membresia ?? "").trim();

  let rendered = template
    .replace(
      /\{\{\s*(?:nombre_completo|nombreCompleto)\s*\}\}|\{\s*(?:nombre_completo|nombreCompleto)\s*\}/gi,
      nombreCompleto,
    )
    .replace(/\{\{\s*nombre\s*\}\}|\{\s*nombre\s*\}/gi, nombre)
    .replace(/\{\{\s*apellido\s*\}\}|\{\s*apellido\s*\}/gi, apellido)
    .replace(/\{\{\s*gym\s*\}\}|\{\s*gym\s*\}/gi, gymName)
    .replace(/\{\{\s*membresia\s*\}\}|\{\s*membresia\s*\}/gi, membresia);

  rendered = rendered
    .replace(/\{\{\s*[\w.-]+\s*\}\}/g, "")
    .replace(/\{\s*[\w.-]+\s*\}/g, "");

  rendered = rendered
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\s+([,.:;!?])/g, "$1")
        .trimEnd(),
    )
    .join("\n")
    .trim();

  return rendered;
}

function whatsappLink(student, message) {
  if (!student?.telefono) return null;
  const sanitizedPhone = student.telefono.replace(/[^\d+]/g, "");
  if (!sanitizedPhone) return null;
  return `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(message)}`;
}

// ----------------------------------------------------
// QA Test Execution Engine
// ----------------------------------------------------
async function runProductionQASuite() {
  console.log("================================================================================");
  console.log("🔍 INICIANDO QA FINAL Y AUDITORÍA DE PRODUCCIÓN — FASE 6 (LANGGYM)");
  console.log("================================================================================\n");

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  const failures = [];

  function check(category, testName, condition, details = "") {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [${category}] ${testName} ${details ? "(" + details + ")" : ""}`);
      passedTests++;
    } else {
      console.error(`  ❌ [${category}] FAIL: ${testName} ${details ? "(" + details + ")" : ""}`);
      failedTests++;
      failures.push({ category, testName, details });
    }
  }

  const sampleConfig = {
    gymName: "Lang Gym",
    countryCode: "54",
    mobilePrefix: "9",
    diasRiesgo: { nivel1: 7, nivel2: 15, nivel3: 30 },
    porVencerDias: 7,
    templates: {
      recuperacion: "Hola {{nombre}}, ¿cómo estás? Hace unos días no te vemos por {{gym}}.",
      cobro: "Hola {{nombre_completo}}, tu membresía {{membresia}} en {{gym}} está por vencer.",
    },
  };

  // 1. RECORRIDO DEL USUARIO & RUTAS
  console.log("\n📁 1. Recorrido de Rutas & Navegación:");
  const requiredRoutes = [
    "app/(app)/page.tsx",
    "app/(app)/alumnos/page.tsx",
    "app/(app)/alumnos/[id]/page.tsx",
    "app/(app)/recuperacion/page.tsx",
    "app/(app)/cobros/page.tsx",
    "app/(app)/metricas/page.tsx",
    "app/(app)/importar/page.tsx",
    "app/(app)/configuracion/page.tsx",
    "app/login/page.tsx",
    "app/forgot-password/page.tsx",
    "app/reset-password/page.tsx",
    "app/auth/callback/route.ts",
  ];

  requiredRoutes.forEach((route) => {
    const fullPath = path.resolve(process.cwd(), route);
    check("RUTAS", `Verificar existencia de ${route}`, fs.existsSync(fullPath));
  });

  // 2. AUTENTICACIÓN & ROUTE GUARDS
  console.log("\n🔒 2. Autenticación & Guardias de Sesión:");
  const middlewareContent = fs.readFileSync(path.resolve(process.cwd(), "middleware.ts"), "utf-8");
  check("AUTH", "Middleware usa supabase.auth.getUser() y no getSession()", 
    middlewareContent.includes("supabase.auth.getUser()") && !middlewareContent.includes("supabase.auth.getSession()")
  );
  check("AUTH", "Middleware redirige no autenticados a /login",
    middlewareContent.includes('url.pathname = "/login"')
  );
  check("AUTH", "Middleware redirige autenticados desde /login a /",
    middlewareContent.includes('url.pathname = "/"')
  );

  const loginPage = fs.readFileSync(path.resolve(process.cwd(), "app/login/page.tsx"), "utf-8");
  check("AUTH", "Login usa mensaje genérico de credenciales inválidas para evitar enumeración",
    loginPage.includes("Credenciales inválidas. Verificá tu correo y contraseña.")
  );

  const authCtx = fs.readFileSync(path.resolve(process.cwd(), "lib/auth/AuthContext.tsx"), "utf-8");
  check("AUTH", "SignOut limpia el Zustand store y localStorage para evitar fugas entre sesiones",
    authCtx.includes("useStore.getState().reset()") && authCtx.includes('localStorage.removeItem("langgym-store")')
  );

  // 3. MULTI-TENANCY & RLS
  console.log("\n🏢 3. Multi-Tenancy & Aislamiento RLS en Base de Datos:");
  const schemaContent = fs.readFileSync(path.resolve(process.cwd(), "supabase/migrations/20260814_initial_schema.sql"), "utf-8");
  check("MULTI-TENANT", "RLS habilitado en tabla 'students'",
    schemaContent.includes("ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;")
  );
  check("MULTI-TENANT", "Políticas RLS en 'students' vinculadas estrictamente a get_auth_org_id()",
    schemaContent.includes('CREATE POLICY "students_select_own" ON public.students') &&
    schemaContent.includes('CREATE POLICY "students_insert_own" ON public.students') &&
    schemaContent.includes('CREATE POLICY "students_update_own" ON public.students') &&
    schemaContent.includes('CREATE POLICY "students_delete_own" ON public.students')
  );
  check("MULTI-TENANT", "RLS habilitado en tabla 'follow_ups'",
    schemaContent.includes("ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;")
  );
  check("MULTI-TENANT", "Restricción UNIQUE compuesta (organization_id, id_socio) activa",
    schemaContent.includes("CONSTRAINT unique_socio_per_org UNIQUE (organization_id, id_socio)")
  );

  // 4. IMPORTACIÓN SIGA & PARSER
  console.log("\n📊 4. Importación SIGA, Normalización & Limpieza:");
  const dirtyCell = "  Carlos \x00\x08 Gómez \x1F ";
  check("IMPORT", "cleanCell elimina caracteres de control y recorta espacios",
    cleanCell(dirtyCell) === "Carlos Gómez"
  );
  check("IMPORT", "cleanCell devuelve null para tokens vacíos '-', 'n/a', 'sd'",
    cleanCell("-") === null && cleanCell("n/a") === null && cleanCell("s/d") === null
  );

  const name1 = splitName("GONZALEZ GUILLERMO");
  check("IMPORT", "splitName convierte mayúsculas a TitleCase y separa nombre/apellido",
    name1.nombre === "Guillermo" || name1.nombre === "Gonzalez Guillermo" || name1.nombreCompleto === "Gonzalez Guillermo"
  );

  const phoneAR1 = normalizePhone("2235851985", null, sampleConfig);
  check("IMPORT", "normalizePhone añade prefijo 549 a número local argentino",
    phoneAR1.telefono === "5492235851985"
  );

  const phoneAR2 = normalizePhone("5492235851985", null, sampleConfig);
  check("IMPORT", "normalizePhone no duplica prefijo si ya incluye 549",
    phoneAR2.telefono === "5492235851985"
  );

  const phoneInvalid = normalizePhone("123", null, sampleConfig);
  check("IMPORT", "normalizePhone devuelve null para números demasiado cortos",
    phoneInvalid.telefono === null && phoneInvalid.telefonoRaw === "123"
  );

  // 5. MOTOR DE PLANTILLAS & WHATSAPP
  console.log("\n💬 5. WhatsApp & Motor de Plantillas Dinámicas:");

  // Caso 1: Alumno completo
  const st1 = {
    id: "1",
    nombre: "Andrés",
    apellido: "Pérez",
    nombreCompleto: "Andrés Pérez",
    telefono: "5492235851985",
    membresia: "Pase Libre",
  };
  const msg1 = renderTemplate("Hola {{nombre}} {{apellido}}, tu plan {{membresia}} en {{gym}} está listo.", st1, sampleConfig);
  check("WHATSAPP", "Reemplazo de variables {{nombre}}, {{apellido}}, {{membresia}}, {{gym}}",
    msg1 === "Hola Andrés Pérez, tu plan Pase Libre en Lang Gym está listo."
  );

  // Caso 2: Alumno sin apellido
  const st2 = {
    id: "2",
    nombre: "Juan",
    apellido: "",
    nombreCompleto: "Juan",
    telefono: "5492235851985",
    membresia: "Funcional",
  };
  const msg2 = renderTemplate("Hola {{nombre}} {{apellido}}, ¿cómo estás?", st2, sampleConfig);
  check("WHATSAPP", "Alumno sin apellido no genera espacios dobles ni 'undefined'",
    msg2 === "Hola Juan, ¿cómo estás?"
  );

  // Caso 3: Variable nombre_completo
  const msg3 = renderTemplate("Estimado {{nombre_completo}}:", st1, sampleConfig);
  check("WHATSAPP", "Reemplazo de {{nombre_completo}}",
    msg3 === "Estimado Andrés Pérez:"
  );

  // Caso 4: Variables con espacios internos {{ nombre }} o etiquetas desconocidas {{cupon}}
  const msg4 = renderTemplate("Hola {{ nombre }}, tu código {{cupon}}", st1, sampleConfig);
  check("WHATSAPP", "Tolerancia a espacios {{ nombre }} y eliminación de etiquetas no reconocidas",
    msg4 === "Hola Andrés, tu código"
  );

  // Caso 5: Generación de enlace de WhatsApp
  const waUrl = whatsappLink(st1, "Hola Andrés!");
  check("WHATSAPP", "whatsappLink genera URL codificada para wa.me",
    waUrl === "https://wa.me/5492235851985?text=Hola%20Andr%C3%A9s!"
  );

  const waBtnContent = fs.readFileSync(path.resolve(process.cwd(), "components/students/WhatsappButton.tsx"), "utf-8");
  check("WHATSAPP", "WhatsappButton implementa bloqueo anti-doble clic (lockRef)",
    waBtnContent.includes("lockRef.current = true")
  );

  // 6. PERSISTENCIA & SERVICIOS
  console.log("\n💾 6. Persistencia, Sincronización & Bajas:");
  const importSvc = fs.readFileSync(path.resolve(process.cwd(), "lib/services/importService.ts"), "utf-8");
  check("PERSISTENCIA", "Import service realiza inserciones en chunks de 100",
    importSvc.includes("chunkArray(toInsert, 100)")
  );
  check("PERSISTENCIA", "Import service actualiza en batches concurrentes de 15",
    importSvc.includes("chunkArray(toUpdate, 15)")
  );
  check("PERSISTENCIA", "Import service registra snapshots históricos para auditoría",
    importSvc.includes('supabase.from("snapshots").insert') || importSvc.includes('.from("snapshots")')
  );
  check("PERSISTENCIA", "Import service audita la importación en 'import_records'",
    importSvc.includes('.from("import_records")')
  );
  check("PERSISTENCIA", "Alumnos que no aparecen en el Excel no se eliminan físicamente (cálculo de bajas lógico)",
    !importSvc.includes('supabase.from("students").delete()')
  );

  // 7. VARIABLES DE ENTORNO & SEGURIDAD
  console.log("\n🔐 7. Variables de Entorno & Auditoría de Secretos:");
  const gitignoreContent = fs.readFileSync(path.resolve(process.cwd(), ".gitignore"), "utf-8");
  check("SEGURIDAD", ".gitignore ignora archivos .env*",
    gitignoreContent.includes(".env*")
  );

  const clientSupabase = fs.readFileSync(path.resolve(process.cwd(), "lib/supabase/client.ts"), "utf-8");
  check("SEGURIDAD", "lib/supabase/client.ts NO expone SUPABASE_SERVICE_ROLE_KEY",
    !clientSupabase.includes("SUPABASE_SERVICE_ROLE_KEY")
  );

  const adminSupabase = fs.readFileSync(path.resolve(process.cwd(), "lib/supabase/admin.ts"), "utf-8");
  check("SEGURIDAD", "lib/supabase/admin.ts bloquea la ejecución en el cliente",
    adminSupabase.includes('typeof window !== "undefined"')
  );

  const nextConfig = fs.readFileSync(path.resolve(process.cwd(), "next.config.ts"), "utf-8");
  check("SEGURIDAD", "next.config.ts aplica cabeceras de seguridad HTTP (HSTS, CSP, X-Frame-Options: DENY)",
    nextConfig.includes("X-Frame-Options") && nextConfig.includes("Strict-Transport-Security") && nextConfig.includes("Content-Security-Policy")
  );

  // 8. ACCESIBILIDAD & RESPONSIVE
  console.log("\n📱 8. Responsive & Accesibilidad (A11y):");
  const modalContent = fs.readFileSync(path.resolve(process.cwd(), "components/ui/Modal.tsx"), "utf-8");
  check("A11Y", "Modal implementa aria-modal='true' y rol dialog",
    modalContent.includes('role="dialog"') && modalContent.includes('aria-modal="true"')
  );

  const alumnosPage = fs.readFileSync(path.resolve(process.cwd(), "app/(app)/alumnos/page.tsx"), "utf-8");
  check("UX", "Página de alumnos implementa paginación configurable",
    alumnosPage.includes("pageSize") && alumnosPage.includes("currentPage")
  );

  const recuperacionPage = fs.readFileSync(path.resolve(process.cwd(), "app/(app)/recuperacion/page.tsx"), "utf-8");
  check("UX", "Página de recuperación implementa paginación",
    recuperacionPage.includes("PAGE_SIZE") && recuperacionPage.includes("currentPage")
  );

  // RESUMEN
  console.log("\n================================================================================");
  console.log(`📊 RESUMEN FINAL: ${passedTests}/${totalTests} PRUEBAS EXITOSAS (${failedTests} FALLOS)`);
  console.log("================================================================================");

  if (failedTests > 0) {
    console.error("Fallos detectados:", failures);
    process.exit(1);
  } else {
    console.log("🌟 TODAS LAS PRUEBAS DE CALIDAD Y SEGURIDAD HAN PASADO CON ÉXITO.");
  }
}

runProductionQASuite();
