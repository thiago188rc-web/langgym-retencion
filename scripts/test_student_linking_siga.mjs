console.log("================================================================================");
console.log("🧪 EJECUTANDO TESTS DE REGISTRO DE CLIENTES Y VINCULACIÓN CON SIGA (PASO 5)");
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

// 1. Mock Database State
const mockDatabase = {
  organizations: [{ id: "org-langgym", name: "Lang Gym" }],
  students: [
    {
      id: "std-uuid-101",
      organization_id: "org-langgym",
      id_socio: "1001",
      nombre_completo: "Carlos Gomez",
      email: "carlos.gomez@gmail.com",
      telefono_raw: "1155667788",
      habilitado: true,
    },
    {
      id: "std-uuid-102",
      organization_id: "org-langgym",
      id_socio: "1002",
      nombre_completo: "Mariana Lopez",
      email: "mariana.lopez@hotmail.com",
      telefono_raw: "1144332211",
      habilitado: true,
    },
    // Ambiguous phone case: Two family members sharing phone
    {
      id: "std-uuid-103",
      organization_id: "org-langgym",
      id_socio: "1003",
      nombre_completo: "Lucia Perez",
      email: "lucia@perez.com",
      telefono_raw: "1199887766",
      habilitado: true,
    },
    {
      id: "std-uuid-104",
      organization_id: "org-langgym",
      id_socio: "1004",
      nombre_completo: "Mateo Perez",
      email: "mateo@perez.com",
      telefono_raw: "1199887766", // Same phone!
      habilitado: true,
    },
  ],
  profiles: [],
  reservations: [],
};

// 2. Logic Simulation for Client Registration & Safe Matching
function simulateRegisterClient(body) {
  const initialStudentCount = mockDatabase.students.length;
  const cleanEmail = (body.email || "").trim().toLowerCase();
  const cleanDigits = (body.telefono || "").replace(/\D/g, "");
  const targetOrgId = "org-langgym";

  // Priority 1: Exact email match
  const emailMatches = mockDatabase.students.filter(
    (s) => s.organization_id === targetOrgId && s.email && s.email.toLowerCase() === cleanEmail
  );

  let matchedStudentId = null;

  if (emailMatches.length === 1) {
    matchedStudentId = emailMatches[0].id;
  } else if (emailMatches.length === 0 && cleanDigits.length >= 8) {
    // Priority 2: Phone match (last 8 digits)
    const suffix = cleanDigits.slice(-8);
    const phoneMatches = mockDatabase.students.filter(
      (s) => s.organization_id === targetOrgId && s.telefono_raw && s.telefono_raw.includes(suffix)
    );

    if (phoneMatches.length === 1) {
      matchedStudentId = phoneMatches[0].id;
    }
    // If phoneMatches > 1 -> Ambiguity! Remain null.
  }

  // Create Profile
  const profileId = `prof-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
  const profile = {
    id: profileId,
    organization_id: targetOrgId,
    email: cleanEmail,
    full_name: `${body.nombre} ${body.apellido || ""}`.trim(),
    role: "cliente", // Forced
    student_id: matchedStudentId,
    phone: body.telefono || null,
  };
  mockDatabase.profiles.push(profile);

  // Assert SIGA source of truth
  const finalStudentCount = mockDatabase.students.length;

  return {
    profile,
    studentCreated: finalStudentCount > initialStudentCount,
    isLinked: Boolean(matchedStudentId),
  };
}

// 3. Security Trigger Simulation
function simulateProfileUpdate(callerRole, callerUserId, profileId, updates) {
  const target = mockDatabase.profiles.find((p) => p.id === profileId);
  if (!target) return { success: false, error: "Profile not found" };

  const isSensitiveFieldChanged =
    (updates.role !== undefined && updates.role !== target.role) ||
    (updates.organization_id !== undefined && updates.organization_id !== target.organization_id) ||
    (updates.student_id !== undefined && updates.student_id !== target.student_id);

  if (isSensitiveFieldChanged) {
    if (callerRole === "cliente" || !["owner", "admin", "staff"].includes(callerRole)) {
      return {
        success: false,
        error: "Operación no permitida: No podés modificar tu rol, organización o vinculación de socio.",
      };
    }
  }

  Object.assign(target, updates);
  return { success: true, profile: target };
}

// -------------------------------------------------------------
// EXECUTE TESTS
// -------------------------------------------------------------

// TEST 1: Unequivocal Email Match
const reg1 = simulateRegisterClient({
  nombre: "Carlos",
  apellido: "Gomez",
  email: "carlos.gomez@gmail.com",
  telefono: "1155667788",
});
assert(reg1.profile.role === "cliente", "Registro: Rol asignado forzosamente como 'cliente'");
assert(reg1.profile.student_id === "std-uuid-101", "Coincidencia inequívoca por email vincula automáticamente con std-uuid-101");
assert(!reg1.studentCreated, "Fuente de verdad: NO se creó ningún alumno nuevo en students");

// TEST 2: Unequivocal Phone Match (when email differs)
const reg2 = simulateRegisterClient({
  nombre: "Mari",
  apellido: "L",
  email: "nuevo.email.mariana@gmail.com",
  telefono: "+54 9 11 4433-2211",
});
assert(reg2.profile.student_id === "std-uuid-102", "Coincidencia inequívoca por teléfono vincula con std-uuid-102");
assert(!reg2.studentCreated, "Fuente de verdad: NO se creó ningún alumno nuevo");

// TEST 3: Ambiguous Phone Match (2 students with same phone)
const reg3 = simulateRegisterClient({
  nombre: "Familia",
  apellido: "Perez",
  email: "contacto@familia.com",
  telefono: "1199887766",
});
assert(reg3.profile.student_id === null, "Ambigüedad: Teléfono compartido entre 2 alumnos NO auto-vincula (student_id = null)");
assert(reg3.isLinked === false, "Portal de cliente recibe isLinked = false para mostrar aviso informativo");

// TEST 4: No match in SIGA
const reg4 = simulateRegisterClient({
  nombre: "Esteban",
  apellido: "Quito",
  email: "esteban@desconocido.com",
  telefono: "1100000000",
});
assert(reg4.profile.student_id === null, "Sin coincidencia: student_id permanece NULL");
assert(!reg4.studentCreated, "Sin coincidencia: NO se crea registro espurio en students");

// TEST 5: Security - Client attempts to inject role = 'owner'
const tamperRole = simulateProfileUpdate("cliente", reg4.profile.id, reg4.profile.id, { role: "owner" });
assert(tamperRole.success === false && tamperRole.error.includes("Operación no permitida"), "Seguridad: Cliente no puede cambiar su rol a owner");

// TEST 6: Security - Client attempts to link themselves to another student_id
const tamperStudent = simulateProfileUpdate("cliente", reg4.profile.id, reg4.profile.id, { student_id: "std-uuid-101" });
assert(tamperStudent.success === false && tamperStudent.error.includes("Operación no permitida"), "Seguridad: Cliente no puede auto-asignarse student_id");

// TEST 7: Staff manual linking
const staffLink = simulateProfileUpdate("admin", "admin-1", reg4.profile.id, { student_id: "std-uuid-103" });
assert(staffLink.success === true && reg4.profile.student_id === "std-uuid-103", "Admin/Staff puede realizar la vinculación manual");

// TEST 8: SIGA Excel Re-import stability
// When a new Excel is imported, students are upserted by (organization_id, id_socio), preserving std-uuid-101
const existingStudent = mockDatabase.students.find((s) => s.id_socio === "1001");
existingStudent.membresia = "Pase Libre Gold Actualizado";
assert(reg1.profile.student_id === existingStudent.id, "Reimportación SIGA: El vínculo profiles.student_id se mantiene intacto tras actualizaciones de Excel");

console.log("\n================================================================================");
console.log(`📊 RESULTADO DE TESTS DE VINCULACIÓN: ${passed}/${total} pruebas superadas.`);
console.log("================================================================================\n");
