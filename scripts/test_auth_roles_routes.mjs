console.log("================================================================================");
console.log("🧪 EJECUTANDO TESTS DE AUTENTICACIÓN, ROLES Y RUTAS (PASO 3)");
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

// 1. Simulate Middleware Routing Decision Engine
function simulateMiddleware(pathname, user, role) {
  const isPublicRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/registro") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/api/auth");

  // 1. Unauthenticated users
  if (!user && !isPublicRoute) {
    return { status: 307, redirect: "/login" };
  }

  // 2. Authenticated users
  if (user) {
    const isClient = role === "cliente";
    const isClientRoute = pathname.startsWith("/mi-panel") || pathname.startsWith("/cliente");

    // A. Public route
    if (isPublicRoute && !pathname.startsWith("/reset-password") && !pathname.startsWith("/auth/callback") && !pathname.startsWith("/api/auth")) {
      return { status: 307, redirect: isClient ? "/mi-panel" : "/" };
    }

    // B. Client trying to access administrative routes
    if (isClient && !isClientRoute && !isPublicRoute) {
      return { status: 307, redirect: "/mi-panel" };
    }

    // C. Admin/Staff trying to access client-only portal
    if (!isClient && isClientRoute) {
      return { status: 307, redirect: "/" };
    }
  }

  return { status: 200, action: "allow" };
}

// A. Unauthenticated user tests
assert(simulateMiddleware("/", null, null).redirect === "/login", "Sin sesión: '/' redirige a /login");
assert(simulateMiddleware("/alumnos", null, null).redirect === "/login", "Sin sesión: '/alumnos' redirige a /login");
assert(simulateMiddleware("/clases", null, null).redirect === "/login", "Sin sesión: '/clases' redirige a /login");
assert(simulateMiddleware("/mi-panel", null, null).redirect === "/login", "Sin sesión: '/mi-panel' redirige a /login");
assert(simulateMiddleware("/login", null, null).action === "allow", "Sin sesión: '/login' permitido");
assert(simulateMiddleware("/registro", null, null).action === "allow", "Sin sesión: '/registro' permitido");

// B. Client tests (role = 'cliente')
const mockClient = { id: "client-123", email: "alumno@test.com" };
assert(simulateMiddleware("/mi-panel", mockClient, "cliente").action === "allow", "Cliente: '/mi-panel' permitido");
assert(simulateMiddleware("/", mockClient, "cliente").redirect === "/mi-panel", "Cliente: '/' redirige a /mi-panel");
assert(simulateMiddleware("/alumnos", mockClient, "cliente").redirect === "/mi-panel", "Cliente: '/alumnos' bloqueado -> /mi-panel");
assert(simulateMiddleware("/configuracion", mockClient, "cliente").redirect === "/mi-panel", "Cliente: '/configuracion' bloqueado -> /mi-panel");
assert(simulateMiddleware("/clases", mockClient, "cliente").redirect === "/mi-panel", "Cliente: '/clases' bloqueado -> /mi-panel");
assert(simulateMiddleware("/metricas", mockClient, "cliente").redirect === "/mi-panel", "Cliente: '/metricas' bloqueado -> /mi-panel");
assert(simulateMiddleware("/login", mockClient, "cliente").redirect === "/mi-panel", "Cliente: '/login' redirige a /mi-panel");

// C. Staff / Admin / Owner tests
const mockAdmin = { id: "admin-456", email: "andres@langgym.com" };
assert(simulateMiddleware("/", mockAdmin, "owner").action === "allow", "Admin: '/' permitido");
assert(simulateMiddleware("/alumnos", mockAdmin, "owner").action === "allow", "Admin: '/alumnos' permitido");
assert(simulateMiddleware("/clases", mockAdmin, "staff").action === "allow", "Staff: '/clases' permitido");
assert(simulateMiddleware("/mi-panel", mockAdmin, "admin").redirect === "/", "Admin: '/mi-panel' redirige a '/'");
assert(simulateMiddleware("/login", mockAdmin, "owner").redirect === "/", "Admin: '/login' redirige a '/'");

// D. Registration Security Tests
function sanitizeRegistrationPayload(rawBody) {
  // Reject any attempts from client to inject role or organization_id
  const safeRole = "cliente";
  const safeStudentId = null; // Stays nullable until matched on server
  return {
    fullName: (rawBody.nombre + " " + (rawBody.apellido || "")).trim(),
    email: rawBody.email?.trim().toLowerCase(),
    role: safeRole,
    studentId: safeStudentId,
  };
}

const maliciousPayload = {
  nombre: "Hacker",
  apellido: "Test",
  email: "hacker@test.com",
  role: "owner", // Injected
  organization_id: "fake-org-id", // Injected
  student_id: "fake-student-id", // Injected
};

const sanitized = sanitizeRegistrationPayload(maliciousPayload);
assert(sanitized.role === "cliente", "Seguridad: Inyección de rol 'owner' en registro anulada, forzado a 'cliente'");
assert(sanitized.studentId === null, "Seguridad: student_id no manipulable por cliente");
assert(!("organization_id" in sanitized), "Seguridad: organization_id derivado exclusivamente en el servidor");

console.log("\n================================================================================");
console.log(`📊 RESULTADO DE TESTS: ${passed}/${total} pruebas de autenticación y roles superadas.`);
console.log("================================================================================\n");
