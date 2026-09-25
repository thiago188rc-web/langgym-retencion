/**
 * E2E AUTOMATED TEST: REAL ADMIN EXCEL IMPORT (NO SERVICE ROLE)
 * Tests the exact admin import flow under real RLS, Auth, idempotency, and small batch.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { parseExcel } from "../lib/import/parseExcel.ts";
import { syncExcelImportToSupabase } from "../lib/services/importService.ts";

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

// Non-privileged client (publishable key only)
const client = createClient(SUPABASE_URL, ANON_KEY);

const ADMIN_EMAIL = "admin@langgym.com";
const ADMIN_PASSWORD = "AdminLangGym2026!";

let orgId = null;

test("1. Authenticate as REAL ADMIN without service_role", async () => {
  const { data, error } = await client.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  assert.equal(error, null, `Admin sign-in must succeed: ${error?.message}`);
  assert.ok(data.user, "User must be defined");
  assert.equal(data.user.role, "authenticated");

  const { data: profile, error: profErr } = await client
    .from("profiles")
    .select("role, organization_id")
    .eq("id", data.user.id)
    .single();

  assert.equal(profErr, null);
  assert.ok(profile.role === "admin" || profile.role === "owner", `Role must be admin or owner, got ${profile.role}`);
  orgId = profile.organization_id;
  assert.ok(orgId, "Organization ID must exist");
  console.log(`✓ Authenticated as ${ADMIN_EMAIL} (role: ${profile.role}, org: ${orgId})`);
});

test("2. Real Excel SEPT 2026.xlsx import: 193/193 synced correctly", async () => {
  const filePath = "C:\\Users\\Thiago\\Downloads\\SEPT 2026.xlsx";
  const nodeBuf = fs.readFileSync(filePath);
  const arrayBuffer = nodeBuf.buffer.slice(nodeBuf.byteOffset, nodeBuf.byteOffset + nodeBuf.byteLength);
  const config = {
    gymName: "LANGGYM",
    ownerName: "Admin",
    countryCode: "54",
    mobilePrefix: "9",
    diasRiesgo: { nivel1: 7, nivel2: 15, nivel3: 30 },
    porVencerDias: 5,
  };

  const parsed = parseExcel(arrayBuffer, config);
  assert.equal(parsed.parsedStudents.length, 193, "Excel must parse exactly 193 students");

  const presentFields = new Set(Object.keys(parsed.mapping.byField));

  const result = await syncExcelImportToSupabase(
    orgId,
    "SEPT 2026.xlsx",
    parsed.parsedStudents,
    presentFields,
    undefined,
    client
  );

  assert.equal(result.total, 193, "Total must be 193");
  assert.equal(result.errores, 0, "Errors must be 0");
  assert.ok(result.importRecord.id, "Import record ID must be returned");
  console.log(`✓ 193 students synced: nuevos=${result.nuevos}, actualizados=${result.actualizados}, sinCambios=${result.sinCambios}, permanecen=${result.permanecen}`);

  // Verify in Supabase via non-privileged client
  const { data: rec, error: recErr } = await client
    .from("import_records")
    .select("*")
    .eq("id", result.importRecord.id)
    .single();
  assert.equal(recErr, null);
  assert.equal(rec.total, 193);
  console.log("✓ import_record verified in Supabase under RLS");

  const { count: stampedCount, error: countErr } = await client
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("last_import_id", result.importRecord.id);
  assert.equal(countErr, null);
  assert.equal(stampedCount, 193, "Exactly 193 students must be stamped with last_import_id");
  console.log(`✓ Exactly ${stampedCount} students stamped with last_import_id`);
});

test("3. Idempotency: Re-importing same Excel produces 0 duplicates", async () => {
  const filePath = "C:\\Users\\Thiago\\Downloads\\SEPT 2026.xlsx";
  const nodeBuf = fs.readFileSync(filePath);
  const arrayBuffer = nodeBuf.buffer.slice(nodeBuf.byteOffset, nodeBuf.byteOffset + nodeBuf.byteLength);
  const config = {
    gymName: "LANGGYM",
    ownerName: "Admin",
    countryCode: "54",
    mobilePrefix: "9",
    diasRiesgo: { nivel1: 7, nivel2: 15, nivel3: 30 },
    porVencerDias: 5,
  };

  const parsed = parseExcel(arrayBuffer, config);

  const beforeCountRes = await client
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  const beforeCount = beforeCountRes.count;

  const presentFields = new Set(Object.keys(parsed.mapping.byField));
  const result = await syncExcelImportToSupabase(
    orgId,
    "SEPT 2026.xlsx",
    parsed.parsedStudents,
    presentFields,
    undefined,
    client
  );

  assert.equal(result.nuevos, 0, "Re-import must produce 0 nuevos");
  assert.equal(result.sinCambios, 193, "Re-import must detect 193 sinCambios");

  const afterCountRes = await client
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  assert.equal(afterCountRes.count, beforeCount, "Total student count in DB must NOT increase");
  console.log("✓ Re-import is strictly idempotent (0 duplicates)");
});

test("4. Small batch import (5 students)", async () => {
  const miniStudents = [
    { idSocio: "MINI-1", nombre: "TestUno", apellido: "Lang", nombreCompleto: "TestUno Lang", telefono: "5492230000001", habilitado: true },
    { idSocio: "MINI-2", nombre: "TestDos", apellido: "Lang", nombreCompleto: "TestDos Lang", telefono: "5492230000002", habilitado: true },
    { idSocio: "MINI-3", nombre: "TestTres", apellido: "Lang", nombreCompleto: "TestTres Lang", telefono: "5492230000003", habilitado: true },
    { idSocio: "MINI-4", nombre: "TestCuatro", apellido: "Lang", nombreCompleto: "TestCuatro Lang", telefono: "5492230000004", habilitado: true },
    { idSocio: "MINI-5", nombre: "TestCinco", apellido: "Lang", nombreCompleto: "TestCinco Lang", telefono: "5492230000005", habilitado: true },
  ];

  const result = await syncExcelImportToSupabase(
    orgId,
    "mini_test.xlsx",
    miniStudents,
    new Set(["idSocio", "nombre", "telefono", "habilitado"]),
    undefined,
    client
  );

  assert.equal(result.total, 5);
  assert.equal(result.errores, 0);
  assert.ok(result.importRecord.id);

  const { count } = await client
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("last_import_id", result.importRecord.id);
  assert.equal(count, 5);
  console.log("✓ Small batch (5 students) imported successfully and stamped");

  // Clean up the 5 mini test students
  await client.from("students").delete().in("id_socio", ["MINI-1", "MINI-2", "MINI-3", "MINI-4", "MINI-5"]);
  console.log("✓ Mini test students cleaned up");
});
