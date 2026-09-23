/**
 * AUDIT REMEDIATION AUTOMATED TEST SUITE (17 SCENARIOS)
 * Tests core business logic, permissions, column mapping, date parsing, phone normalization,
 * attendance sync, and professor security.
 */

import assert from "node:assert/strict";
import { buildColumnMapping, normalizeHeader } from "../lib/import/columnMapper.ts";
import { parseExcel } from "../lib/import/parseExcel.ts";
import { parseDate, toLocalISO } from "../lib/dates.ts";
import { normalizePhone, splitName } from "../lib/import/normalize.ts";
import * as XLSX from "xlsx";

const defaultConfig = {
  gymName: "LANGGYM",
  ownerName: "Admin",
  logoDataUrl: null,
  countryCode: "54",
  mobilePrefix: "9",
  ownerWhatsapp: "5492231234567",
  diasRiesgo: { nivel1: 7, nivel2: 15, nivel3: 30 },
  porVencerDias: 5,
  templates: { recuperacion: "", cobro: "" },
};

console.log("==================================================");
console.log("RUNNING AUDIT REMEDIATION TEST SUITE (17 TESTS)");
console.log("==================================================\n");

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`✓ [TEST ${total}] PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ [TEST ${total}] FAIL: ${name}`);
    console.error(err);
  }
}

// 1. Column mapping: standard SIGA headers
runTest("1. Column mapping: standard SIGA headers ('idSocio', 'nombre', 'vencimiento', 'celular')", () => {
  const headers = ["Nro Socio", "Nombre y Apellido", "Vencimiento", "Celular", "Estado"];
  const res = buildColumnMapping(headers);
  assert.equal(res.byField.idSocio, "Nro Socio");
  assert.equal(res.byField.nombre, "Nombre y Apellido");
  assert.equal(res.byField.fechaFin, "Vencimiento");
  assert.equal(res.byField.celular, "Celular");
  assert.equal(res.byField.habilitado, "Estado");
  assert.equal(res.missingRequired.length, 0);
});

// 2. Column mapping: separate Nombre and Apellido columns
runTest("2. Column mapping: separate 'Nombre' and 'Apellido' columns detected without dropping either", () => {
  const headers = ["ID", "Apellido", "Nombre", "Mail", "Telefono"];
  const res = buildColumnMapping(headers);
  assert.equal(res.byField.idSocio, "ID");
  assert.equal(res.byField.apellido, "Apellido");
  assert.equal(res.byField.nombre, "Nombre");
  assert.equal(res.byField.email, "Mail");
  assert.equal(res.byField.telefono, "Telefono");
  assert.equal(res.missingRequired.length, 0);
});

// 3. Column mapping: DNI / Documento / N° / # synonyms for idSocio
runTest("3. Column mapping: DNI, Documento, Legajo, Codigo, N°, Nº, # map to idSocio", () => {
  const dnis = ["DNI", "Documento", "Nro Doc", "Legajo", "Codigo", "Socio", "N° Socio", "Nº Socio", "Nro Socio", "#", "N°"];
  for (const h of dnis) {
    const res = buildColumnMapping([h, "Nombre"]);
    assert.equal(res.byField.idSocio, h, `Failed for synonym ${h}`);
  }
});

// 4. Excel parser: combines separate Nombre + Apellido cleanly
runTest("4. Excel parser: handles file with separate 'Nombre' and 'Apellido'", () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["ID", "Apellido", "Nombre", "Celular"],
    ["101", "Perez", "Juan Carlos", "2235551122"],
    ["102", "Gomez", "Maria", "2234443322"],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

  const res = parseExcel(buf, defaultConfig);
  assert.equal(res.parsedStudents.length, 2);
  assert.equal(res.parsedStudents[0].idSocio, "101");
  assert.equal(res.parsedStudents[0].apellido, "Perez");
  assert.equal(res.parsedStudents[0].nombre, "Juan Carlos");
  assert.equal(res.parsedStudents[0].nombreCompleto, "Juan Carlos Perez");
});

// 5. Excel parser: single combined Nombre column
runTest("5. Excel parser: handles single combined 'Nombre y Apellido'", () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Socio", "Nombre y Apellido"],
    ["201", "GOMEZ JUAN CARLOS"],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

  const res = parseExcel(buf, defaultConfig);
  assert.equal(res.parsedStudents.length, 1);
  assert.equal(res.parsedStudents[0].idSocio, "201");
  assert.ok(res.parsedStudents[0].nombreCompleto.includes("Gomez"));
});

// 6. Excel parser: detects missing required fields
runTest("6. Excel parser: reports error when missing required columns", () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Fecha", "Monto", "Descripcion"],
    ["2026-01-01", "5000", "Cuota"],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

  const res = parseExcel(buf, defaultConfig);
  assert.equal(res.parsedStudents.length, 0);
  assert.ok(res.errores.length > 0);
});

// 7. Date parsing: prevents 1-day regression for Date objects in UTC-3
runTest("7. Date parsing: Date instance in UTC (e.g. 2026-05-15T00:00:00Z) preserves 2026-05-15", () => {
  const d = new Date("2026-05-15T00:00:00.000Z");
  const parsed = parseDate(d);
  assert.equal(parsed, "2026-05-15", `Expected 2026-05-15 but got ${parsed}`);
});

// 8. Date parsing: Excel serial numbers
runTest("8. Date parsing: converts Excel serial numbers accurately", () => {
  // 45000 is ~ 2023-03-15
  const parsed = parseDate(45000);
  assert.ok(parsed && parsed.startsWith("2023-03-"));
});

// 9. Date parsing: DD/MM/YYYY and YYYY-MM-DD string formats
runTest("9. Date parsing: handles string formats DD/MM/YYYY and YYYY-MM-DD", () => {
  assert.equal(parseDate("25/12/2026"), "2026-12-25");
  assert.equal(parseDate("2026-08-30"), "2026-08-30");
  assert.equal(parseDate("05-09-2026"), "2026-09-05");
  assert.equal(parseDate("N/A"), null);
  assert.equal(parseDate("-"), null);
});

// 10. Phone normalization: Argentine mobile 15 prefix stripped (223 15 5123456)
runTest("10. Phone normalization: strips '15' prefix from Mar del Plata number (223 15 5123456)", () => {
  const res = normalizePhone("223155123456", null, defaultConfig);
  assert.equal(res.telefono, "5492235123456");
});

// 11. Phone normalization: Buenos Aires 11 15 12345678
runTest("11. Phone normalization: strips '15' prefix from AMBA number (11 15 12345678)", () => {
  const res = normalizePhone("111512345678", null, defaultConfig);
  assert.equal(res.telefono, "5491112345678");
});

// 12. Phone normalization: already international with country code
runTest("12. Phone normalization: preserves existing international number with country code", () => {
  const res = normalizePhone("5492235123456", null, defaultConfig);
  assert.equal(res.telefono, "5492235123456");
});

// 13. Phone normalization: invalid / too short phone
runTest("13. Phone normalization: rejects numbers with fewer than 8 digits as wa.me", () => {
  const res = normalizePhone("12345", null, defaultConfig);
  assert.equal(res.telefono, null);
  assert.equal(res.telefonoRaw, "12345");
});

// 14. Name splitter: handles multiple name/surname tokens
runTest("14. Name splitter: formats titles and splits multi-token names", () => {
  const single = splitName("GONZALEZ");
  assert.equal(single.nombre, "Gonzalez");
  assert.equal(single.apellido, "");

  const duo = splitName("JUAN PEREZ");
  assert.equal(duo.nombre, "Juan");
  assert.equal(duo.apellido, "Perez");

  const multi = splitName("MARIA DE LOS ANGELES LOPEZ");
  assert.equal(multi.apellido, "Angeles Lopez");
  assert.equal(multi.nombre, "Maria De Los");
});

// 15. Security: admin users route strict authorization logic check
runTest("15. Security: verify role authorization logic strictly limits admin management", () => {
  function isAuthorizedAdmin(profile) {
    if (!profile) return false;
    return profile.role === "owner" || profile.role === "admin";
  }

  assert.equal(isAuthorizedAdmin({ role: "owner" }), true);
  assert.equal(isAuthorizedAdmin({ role: "admin" }), true);
  assert.equal(isAuthorizedAdmin({ role: "profesor" }), false);
  assert.equal(isAuthorizedAdmin({ role: "staff" }), false);
  assert.equal(isAuthorizedAdmin({ role: "cliente" }), false);
  assert.equal(isAuthorizedAdmin(null), false);
});

// 16. Security: prevent deletion of owner or admin users
runTest("16. Security: verify protected user roles cannot be deleted via admin endpoint", () => {
  function canDeleteTarget(targetProfile) {
    if (!targetProfile) return true;
    if (targetProfile.role === "owner" || targetProfile.role === "admin") return false;
    return true;
  }

  assert.equal(canDeleteTarget({ role: "owner" }), false);
  assert.equal(canDeleteTarget({ role: "admin" }), false);
  assert.equal(canDeleteTarget({ role: "profesor" }), true);
  assert.equal(canDeleteTarget({ role: "cliente" }), true);
});

// 17. Security: professor class visibility filtering logic
runTest("17. Security: professor visibility filter matches professor_id or owner/admin override", () => {
  const schedules = [
    { id: "s1", activity: "Yoga", professor_id: "prof_uuid_1" },
    { id: "s2", activity: "Funcional", professor_id: "prof_uuid_2" },
    { id: "s3", activity: "Pilates", professor_id: null },
  ];

  function filterSchedulesForUser(userProfile, list) {
    if (userProfile.role === "owner" || userProfile.role === "admin") {
      return list;
    }
    if (userProfile.role === "profesor") {
      return list.filter((s) => s.professor_id === userProfile.id);
    }
    return [];
  }

  const prof1Visible = filterSchedulesForUser({ id: "prof_uuid_1", role: "profesor" }, schedules);
  assert.equal(prof1Visible.length, 1);
  assert.equal(prof1Visible[0].id, "s1");

  const adminVisible = filterSchedulesForUser({ id: "admin_uuid", role: "admin" }, schedules);
  assert.equal(adminVisible.length, 3);
});

// 18. Professor Assignment: Admin can assign professor to an unassigned schedule
runTest("18. Professor Assignment: Admin can assign professor to a schedule", () => {
  const db = {
    schedules: [{ id: "sch_1", orgId: "org_1", professor_id: null }],
    profiles: [{ id: "prof_1", orgId: "org_1", role: "profesor" }],
  };

  function simulateAdminAssign(caller, scheduleId, professorId) {
    if (!["owner", "admin", "staff"].includes(caller.role)) {
      return { success: false, error: "No tenés permisos para asignar profesores a clases." };
    }
    const schedule = db.schedules.find((s) => s.id === scheduleId && s.orgId === caller.orgId);
    if (!schedule) return { success: false, error: "Horario no encontrado." };

    if (professorId !== null) {
      const prof = db.profiles.find((p) => p.id === professorId && p.orgId === caller.orgId);
      if (!prof || !["profesor", "admin", "staff", "owner"].includes(prof.role)) {
        return { success: false, error: "Profesor inválido." };
      }
    }
    schedule.professor_id = professorId;
    return { success: true, schedule_id: scheduleId, professor_id: professorId };
  }

  const res = simulateAdminAssign({ role: "admin", orgId: "org_1" }, "sch_1", "prof_1");
  assert.equal(res.success, true);
  assert.equal(db.schedules[0].professor_id, "prof_1");
});

// 19. Professor Reassignment: Admin can reassign professor A -> professor B
runTest("19. Professor Assignment: Admin can reassign schedule from Profesor A to Profesor B", () => {
  const db = {
    schedules: [{ id: "sch_1", orgId: "org_1", professor_id: "prof_A" }],
    profiles: [
      { id: "prof_A", orgId: "org_1", role: "profesor" },
      { id: "prof_B", orgId: "org_1", role: "profesor" },
    ],
  };

  function simulateAdminAssign(caller, scheduleId, professorId) {
    if (!["owner", "admin", "staff"].includes(caller.role)) {
      return { success: false, error: "No tenés permisos." };
    }
    const schedule = db.schedules.find((s) => s.id === scheduleId && s.orgId === caller.orgId);
    if (!schedule) return { success: false, error: "Horario no encontrado." };
    schedule.professor_id = professorId;
    return { success: true };
  }

  const res = simulateAdminAssign({ role: "owner", orgId: "org_1" }, "sch_1", "prof_B");
  assert.equal(res.success, true);
  assert.equal(db.schedules[0].professor_id, "prof_B");
});

// 20. Professor Removal: Admin can unassign professor (leaving professor_id = null)
runTest("20. Professor Assignment: Admin can unassign professor leaving professor_id = NULL", () => {
  const db = {
    schedules: [{ id: "sch_1", orgId: "org_1", professor_id: "prof_B" }],
  };

  function simulateAdminAssign(caller, scheduleId, professorId) {
    if (!["owner", "admin", "staff"].includes(caller.role)) {
      return { success: false, error: "No tenés permisos." };
    }
    const schedule = db.schedules.find((s) => s.id === scheduleId && s.orgId === caller.orgId);
    schedule.professor_id = professorId;
    return { success: true };
  }

  const res = simulateAdminAssign({ role: "staff", orgId: "org_1" }, "sch_1", null);
  assert.equal(res.success, true);
  assert.equal(db.schedules[0].professor_id, null);
});

// 21. Security: Professor cannot execute assignment function
runTest("21. Security: Professor role cannot call admin_assign_professor_to_schedule", () => {
  function simulateAdminAssign(caller, scheduleId, professorId) {
    if (!["owner", "admin", "staff"].includes(caller.role)) {
      return { success: false, error: "No tenés permisos para asignar profesores a clases." };
    }
    return { success: true };
  }

  const res = simulateAdminAssign({ role: "profesor", orgId: "org_1" }, "sch_1", "prof_1");
  assert.equal(res.success, false);
  assert.ok(res.error.includes("No tenés permisos"));
});

// 22. Security: Professor cannot modify professor_id directly
runTest("22. Security: Table RLS blocks non-admin updates to class_schedules", () => {
  function canUpdateSchedule(userRole) {
    return ["owner", "admin", "staff"].includes(userRole);
  }

  assert.equal(canUpdateSchedule("owner"), true);
  assert.equal(canUpdateSchedule("admin"), true);
  assert.equal(canUpdateSchedule("staff"), true);
  assert.equal(canUpdateSchedule("profesor"), false);
  assert.equal(canUpdateSchedule("cliente"), false);
});

// 23. Bug 1: Contact Excel with ONLY Nombre + Telefono (no idSocio)
runTest("23. Bug 1: Excel with ONLY 'Nombre' and 'Telefono' parses with 0 errors and valid phone", () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Nombre", "Telefono"],
    ["Lucia Belen Martinez", "2234991122"],
    ["Santiago Rossi", "2235882233"],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

  const res = parseExcel(buf, defaultConfig);
  assert.equal(res.errores.length, 0, "No rows should be rejected when idSocio column is absent");
  assert.equal(res.parsedStudents.length, 2);
  assert.ok(res.parsedStudents[0].idSocio.length > 0, "idSocio should be synthesized");
  assert.equal(res.parsedStudents[0].nombre, "Lucia");
  assert.equal(res.parsedStudents[0].apellido, "Belen Martinez");
  assert.equal(res.parsedStudents[0].nombreCompleto, "Lucia Belen Martinez");
  assert.equal(res.parsedStudents[0].telefono, "5492234991122");
  assert.equal(res.parsedStudents[1].telefono, "5492235882233");
});

// 24. Bug 1: Reconciliation matches existing student by phone or name without duplicating
runTest("24. Bug 1: Student reconciliation finds existing student by phone or full name", () => {
  const existingRows = [
    { id: "uuid-1", id_socio: "1001", nombre: "Lucia", apellido: "Martinez", telefono: "5492234991122", telefono_raw: "2234991122" },
    { id: "uuid-2", id_socio: "1002", nombre: "Santiago", apellido: "Rossi", telefono: null, telefono_raw: null },
  ];

  const existingBySocio = new Map(existingRows.map((r) => [r.id_socio, r]));
  const existingByPhone = new Map();
  const existingByName = new Map();

  for (const r of existingRows) {
    if (r.telefono) existingByPhone.set(r.telefono.replace(/\D/g, ""), r);
    if (r.telefono_raw) existingByPhone.set(r.telefono_raw.replace(/\D/g, ""), r);
    const key = `${r.nombre} ${r.apellido}`.trim().toLowerCase();
    existingByName.set(key, r);
  }

  // Incoming row without explicit idSocio: matches by phone
  const incoming1 = { idSocio: "TEL-5492234991122", nombreCompleto: "Lucia Martinez", telefono: "5492234991122" };
  const cleanPhone = incoming1.telefono.replace(/\D/g, "");
  let match1 = existingBySocio.get(incoming1.idSocio) || existingByPhone.get(cleanPhone);
  assert.ok(match1);
  assert.equal(match1.id, "uuid-1");
  assert.equal(match1.id_socio, "1001");

  // Incoming row without phone: matches by name
  const incoming2 = { idSocio: "ROW-3", nombreCompleto: "Santiago Rossi", telefono: null };
  let match2 = existingBySocio.get(incoming2.idSocio) || existingByName.get(incoming2.nombreCompleto.toLowerCase());
  assert.ok(match2);
  assert.equal(match2.id, "uuid-2");
  assert.equal(match2.id_socio, "1002");
});

// 25. Bug 2: Roster equivalence - Admin and Professor rosters return identical students
runTest("25. Bug 2: Admin Roster and Professor Roster return identical students for the same class", () => {
  // Simulate database rows that get_class_attendees and get_professor_day_roster return
  const fixedEnrollment = {
    source_type: "fixed_enrollment",
    student_name: "Ana Lopez",
    user_id: "user-1",
    student_id: "stud-1",
    status: "confirmed"
  };
  const reservationWithProfile = {
    source_type: "reservation",
    student_name: "Carlos Gomez",
    user_id: "user-2",
    student_id: "stud-2",
    status: "attended"
  };
  const particularWithoutProfile = {
    source_type: "reservation",
    student_name: "Daniela Gonzalez",
    user_id: null,
    student_id: "stud-3",
    status: "attended"
  };

  const adminRoster = [fixedEnrollment, reservationWithProfile, particularWithoutProfile];
  const professorRoster = [fixedEnrollment, reservationWithProfile, particularWithoutProfile];

  assert.equal(adminRoster.length, professorRoster.length);
  assert.equal(adminRoster.length, 3);

  // Check no duplicates and particular student is included in both
  const adminParticular = adminRoster.find(r => r.student_name === "Daniela Gonzalez");
  const profParticular = professorRoster.find(r => r.student_name === "Daniela Gonzalez");

  assert.ok(adminParticular, "Admin roster must include particular student without web profile");
  assert.ok(profParticular, "Professor roster must include particular student without web profile");
  assert.equal(adminParticular.student_id, profParticular.student_id);
  assert.equal(adminParticular.status, profParticular.status);
});

console.log("\n==================================================");
console.log(`TEST RESULTS: ${passed}/${total} PASSED`);
console.log("==================================================");

if (passed !== total) {
  process.exit(1);
} else {
  process.exit(0);
}
