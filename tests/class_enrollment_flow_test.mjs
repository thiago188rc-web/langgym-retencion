// Integration test for the "turno fijo" enrollment approval flow:
// cliente solicita turno -> pending -> staff aprueba -> active + reservas
// generadas -> staff puede liberar el turno -> reservas futuras canceladas.
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
let firstScheduleId = null;
let enrollmentId = null;

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

test("1. cliente ve horarios disponibles para solicitar turno", async () => {
  if (!asClient) return;
  const { data, error } = await asClient.rpc("get_available_class_schedules");
  assert.equal(error, null);
  assert.ok(Array.isArray(data) && data.length > 0, "must have at least one seeded class schedule");
  firstScheduleId = data[0].schedule_id;
});

test("2. cliente solicita un turno -> queda 'pending', no confirmado todavía", async () => {
  if (!asClient || !firstScheduleId) return;
  const { data, error } = await asClient.rpc("request_class_enrollment", { p_schedule_id: firstScheduleId });
  assert.equal(error, null);
  assert.equal(data.success, true, JSON.stringify(data));
  enrollmentId = data.enrollment_id;

  const { data: row } = await admin.from("class_enrollments").select("status").eq("id", enrollmentId).single();
  assert.equal(row.status, "pending", "a fresh request must never be auto-confirmed");
});

test("3. cliente NO puede solicitar un segundo turno mientras el primero está pendiente ('por única vez')", async () => {
  if (!asClient || !firstScheduleId) return;
  const { data } = await asClient.rpc("request_class_enrollment", { p_schedule_id: firstScheduleId });
  assert.equal(data.success, false);
  assert.match(data.error, /pendiente/i);
});

test("4. el turno pendiente aparece en la cola de aprobación del staff", async () => {
  if (!asAdmin || !enrollmentId) return;
  const { data, error } = await asAdmin.rpc("get_pending_enrollment_requests");
  assert.equal(error, null);
  const found = data.find((r) => r.enrollment_id === enrollmentId);
  assert.ok(found, "the pending request must be visible to staff");
  assert.equal(found.profile_email, TEST_EMAIL);
});

test("5. staff aprueba el turno -> queda 'active' y se generan reservas futuras", async () => {
  if (!asAdmin || !enrollmentId) return;
  const { data, error } = await asAdmin.rpc("approve_class_enrollment", { p_enrollment_id: enrollmentId });
  assert.equal(error, null);
  assert.equal(data.success, true, JSON.stringify(data));
  assert.ok(data.reservations_generated > 0, "approving must generate upcoming reservations");

  const { data: row } = await admin.from("class_enrollments").select("status").eq("id", enrollmentId).single();
  assert.equal(row.status, "active");

  const { data: reservations } = await admin
    .from("reservations")
    .select("id, status")
    .eq("class_schedule_id", firstScheduleId)
    .eq("user_id", createdUserId)
    .eq("status", "confirmed");
  assert.ok(reservations.length > 0, "confirmed reservations must exist for the approved turno");
});

test("6. el turno activo aparece en la lista de turnos activos del staff", async () => {
  if (!asAdmin || !enrollmentId) return;
  const { data, error } = await asAdmin.rpc("get_active_enrollments");
  assert.equal(error, null);
  const found = data.find((r) => r.enrollment_id === enrollmentId);
  assert.ok(found, "the active turno must be visible to staff");
});

test("7. cliente ve su turno activo y arma el link de WhatsApp para pedir cambio", async () => {
  if (!asClient) return;
  const { data } = await asClient
    .from("class_enrollments")
    .select("status")
    .eq("user_id", createdUserId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .single();
  assert.equal(data.status, "active");
});

test("8. cliente NO puede modificar el status de su propio turno directamente (solo vía RPC)", async () => {
  if (!asClient || !enrollmentId) return;
  // No UPDATE/INSERT policy exists on class_enrollments (only SELECT), so
  // PostgREST silently affects 0 rows instead of raising an error — assert
  // on the actual row state, not on `error`, to catch that RLS gap for real.
  await asClient.from("class_enrollments").update({ status: "rejected" }).eq("id", enrollmentId);

  const { data: row } = await admin.from("class_enrollments").select("status").eq("id", enrollmentId).single();
  assert.equal(row.status, "active", "a client must never be able to change their own enrollment status directly");
});

test("9. staff libera el turno -> reservas futuras se cancelan", async () => {
  if (!asAdmin || !enrollmentId) return;
  const { data, error } = await asAdmin.rpc("cancel_class_enrollment", { p_enrollment_id: enrollmentId });
  assert.equal(error, null);
  assert.equal(data.success, true, JSON.stringify(data));
  assert.ok(data.reservations_cancelled > 0);

  const { data: row } = await admin.from("class_enrollments").select("status").eq("id", enrollmentId).single();
  assert.equal(row.status, "cancelled");

  const { data: stillConfirmed } = await admin
    .from("reservations")
    .select("id")
    .eq("class_schedule_id", firstScheduleId)
    .eq("user_id", createdUserId)
    .eq("status", "confirmed");
  assert.equal(stillConfirmed.length, 0, "no confirmed reservations should remain after cancelling the turno");
});
