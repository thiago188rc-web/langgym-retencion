// Integration test for the "turnos libres semanales" enrollment flow:
// cliente elige VARIOS días/horarios de una sola vez (por única vez) ->
// quedan 'pending' -> staff los aprueba (uno por uno o todos juntos) ->
// 'active' + reservas generadas -> staff puede liberar un turno puntual sin
// afectar los demás, y puede asignar uno nuevo directamente (WhatsApp).
//
// Creates ONLY a disposable test client account (deleted at the end).
// Uses the real admin account to exercise the approval RPCs, exactly like
// the real app does (no service-role impersonation of staff actions).
//
// Run with: node --test tests/class_enrollment_flow_test.mjs

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key && rest.length > 0) {
      process.env[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.TEST_APP_URL || "http://localhost:3000";

// Requires a real admin/owner account to exercise the approval RPCs as staff.
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "andres@tudominio.com";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

const RUN_ID = Date.now();
const TEST_EMAIL = `e2e-turno-test-${RUN_ID}@example.com`;
const TEST_PASSWORD = "TestPass123!";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let createdUserId = null;
let asClient = null;
let asAdmin = null;
let pickedScheduleIds = []; // 3 schedules with defined capacity, across different days
let fourthScheduleId = null; // used for the "one-time lock still holds" + direct-assign tests
let enrollmentIds = []; // the 3 created 'pending' -> 'active' enrollments

after(async () => {
  if (createdUserId) {
    await admin.auth.admin.deleteUser(createdUserId).catch(() => {});
  }
});

test("setup: register disposable test client + sign in as client and as real admin", async (t) => {
  if (!ADMIN_PASSWORD) {
    t.skip("TEST_ADMIN_PASSWORD not set — skipping suite (see tests/README or ask for the credential).");
    return;
  }

  const res = await fetch(`${APP_URL}/api/auth/register-client`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre: "E2E", apellido: "Turno", email: TEST_EMAIL, telefono: "", password: TEST_PASSWORD }),
  });
  const body = await res.json();
  assert.equal(body.success, true, `registration must succeed: ${JSON.stringify(body)}`);

  const { data: usersData } = await admin.auth.admin.listUsers();
  const authUser = usersData?.users?.find((u) => u.email?.toLowerCase() === TEST_EMAIL);
  assert.ok(authUser, "auth user must exist after registration");
  createdUserId = authUser.id;

  asClient = createClient(SUPABASE_URL, ANON_KEY);
  const { error: clientSignInErr } = await asClient.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  assert.equal(clientSignInErr, null);

  asAdmin = createClient(SUPABASE_URL, ANON_KEY);
  const { error: adminSignInErr } = await asAdmin.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  assert.equal(adminSignInErr, null, "admin sign-in must succeed (check TEST_ADMIN_PASSWORD)");
});

test("1. cliente ve varios horarios disponibles, en distintos días, para elegir libremente", async () => {
  if (!asClient) return;
  const { data, error } = await asClient.rpc("get_available_class_schedules");
  assert.equal(error, null);
  assert.ok(Array.isArray(data) && data.length >= 4, "must have several seeded class schedules to choose from");

  // Pick 3 schedules with a defined capacity, on different days, to exercise "3 días a elección".
  const withCapacity = data.filter((s) => s.capacity != null && s.capacity > 0);
  const distinctDays = [];
  for (const s of withCapacity) {
    if (!distinctDays.some((d) => d.day_of_week === s.day_of_week)) distinctDays.push(s);
    if (distinctDays.length === 4) break;
  }
  assert.ok(distinctDays.length >= 4, "need at least 4 schedules on different days with capacity defined");
  pickedScheduleIds = distinctDays.slice(0, 3).map((s) => s.schedule_id);
  fourthScheduleId = distinctDays[3].schedule_id;
});

test("2. cliente elige 3 horarios de una sola vez -> los 3 quedan 'pending' (no confirmados todavía)", async () => {
  if (!asClient || pickedScheduleIds.length !== 3) return;
  const { data, error } = await asClient.rpc("request_class_enrollments_bulk", { p_schedule_ids: pickedScheduleIds });
  assert.equal(error, null);
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(data.count, 3, "must create exactly 3 pending enrollments, one per chosen schedule");

  const { data: rows } = await admin
    .from("class_enrollments")
    .select("id, status, class_schedule_id")
    .eq("user_id", createdUserId);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.status === "pending"), "a fresh bulk request must never be auto-confirmed");
  enrollmentIds = rows.map((r) => r.id);
});

test("3. cliente NO puede volver a elegir horarios por su cuenta ('por única vez') mientras tiene solicitudes pendientes", async () => {
  if (!asClient || !fourthScheduleId) return;
  const { data } = await asClient.rpc("request_class_enrollments_bulk", { p_schedule_ids: [fourthScheduleId] });
  assert.equal(data.success, false);
  assert.match(data.error, /ya anotaste tus horarios/i);
});

test("4. los 3 horarios pendientes aparecen agrupados para el mismo alumno en la cola de aprobación del staff", async () => {
  if (!asAdmin || enrollmentIds.length !== 3) return;
  const { data, error } = await asAdmin.rpc("get_pending_enrollment_requests");
  assert.equal(error, null);
  const mine = data.filter((r) => r.user_id === createdUserId);
  assert.equal(mine.length, 3, "staff must see all 3 pending requests for this student");
  assert.ok(mine.every((r) => r.profile_email === TEST_EMAIL));
});

test("5. staff aprueba los 3 turnos juntos (bulk) -> los 3 quedan 'active' y generan reservas futuras", async () => {
  if (!asAdmin || enrollmentIds.length !== 3) return;
  const { data, error } = await asAdmin.rpc("approve_class_enrollments_bulk", { p_enrollment_ids: enrollmentIds });
  assert.equal(error, null);
  assert.equal(data.success, true, JSON.stringify(data));
  assert.equal(data.approved_count, 3);
  assert.equal(data.failed_count, 0);
  assert.ok(data.reservations_generated > 0);

  const { data: rows } = await admin.from("class_enrollments").select("status").eq("user_id", createdUserId);
  assert.ok(rows.every((r) => r.status === "active"));

  const { data: reservations } = await admin
    .from("reservations")
    .select("id, class_schedule_id")
    .eq("user_id", createdUserId)
    .eq("status", "confirmed");
  const distinctSchedules = new Set(reservations.map((r) => r.class_schedule_id));
  assert.equal(distinctSchedules.size, 3, "confirmed reservations must exist for all 3 approved schedules");
});

test("6. los 3 turnos activos aparecen en la lista de turnos activos del staff", async () => {
  if (!asAdmin || enrollmentIds.length !== 3) return;
  const { data, error } = await asAdmin.rpc("get_active_enrollments");
  assert.equal(error, null);
  const mine = data.filter((r) => r.user_id === createdUserId);
  assert.equal(mine.length, 3, "staff must see all 3 active turnos for this student");
});

test("7. cliente ve sus 3 turnos activos y arma el link de WhatsApp con los 3 en el mensaje", async () => {
  if (!asClient) return;
  const { data } = await asClient.from("class_enrollments").select("status").eq("user_id", createdUserId);
  assert.equal(data.length, 3);
  assert.ok(data.every((r) => r.status === "active"));
});

test("8. cliente NO puede modificar el status de sus propios turnos directamente (solo vía RPC)", async () => {
  if (!asClient || enrollmentIds.length !== 3) return;
  // No UPDATE/INSERT policy exists on class_enrollments (only SELECT), so
  // PostgREST silently affects 0 rows instead of raising an error — assert
  // on the actual row state, not on `error`, to catch that RLS gap for real.
  await asClient.from("class_enrollments").update({ status: "rejected" }).eq("id", enrollmentIds[0]);

  const { data: row } = await admin.from("class_enrollments").select("status").eq("id", enrollmentIds[0]).single();
  assert.equal(row.status, "active", "a client must never be able to change their own enrollment status directly");
});

test("9. staff libera UN solo turno -> se cancela solo ese (reservas futuras incluidas), los otros 2 siguen activos", async () => {
  if (!asAdmin || enrollmentIds.length !== 3) return;
  const targetId = enrollmentIds[0];
  const { data, error } = await asAdmin.rpc("cancel_class_enrollment", { p_enrollment_id: targetId });
  assert.equal(error, null);
  assert.equal(data.success, true, JSON.stringify(data));
  assert.ok(data.reservations_cancelled > 0);

  const { data: rows } = await admin
    .from("class_enrollments")
    .select("id, status")
    .eq("user_id", createdUserId)
    .order("requested_at", { ascending: true });

  const cancelled = rows.find((r) => r.id === targetId);
  assert.equal(cancelled.status, "cancelled");
  const stillActive = rows.filter((r) => r.id !== targetId);
  assert.equal(stillActive.length, 2);
  assert.ok(stillActive.every((r) => r.status === "active"), "freeing one turno must not touch the others");
});

test("10. cliente sigue sin poder auto-solicitar aunque uno de sus turnos quedó libre (el resto sigue activo)", async () => {
  if (!asClient || !fourthScheduleId) return;
  const { data } = await asClient.rpc("request_class_enrollments_bulk", { p_schedule_ids: [fourthScheduleId] });
  assert.equal(data.success, false);
  assert.match(data.error, /ya anotaste tus horarios/i);
});

test("11. staff asigna un turno nuevo directamente al alumno (resuelve un pedido de cambio por WhatsApp)", async () => {
  if (!asAdmin || !fourthScheduleId) return;
  const { data, error } = await asAdmin.rpc("admin_assign_enrollment", {
    p_user_id: createdUserId,
    p_schedule_id: fourthScheduleId,
  });
  assert.equal(error, null);
  assert.equal(data.success, true, JSON.stringify(data));
  assert.ok(data.reservations_generated > 0);

  const { data: row } = await admin
    .from("class_enrollments")
    .select("status, decision_notes")
    .eq("user_id", createdUserId)
    .eq("class_schedule_id", fourthScheduleId)
    .single();
  assert.equal(row.status, "active");
  assert.match(row.decision_notes || "", /asignado directamente/i);
});
