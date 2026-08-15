import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log("Supabase URL:", supabaseUrl);
console.log("Has Service Key:", Boolean(serviceRoleKey));
console.log("Has Anon Key:", Boolean(anonKey));

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anonClient = createClient(supabaseUrl, anonKey);

async function diagnose() {
  console.log("\n--- Diagnosing Organizations ---");
  const { data: orgs, error: orgErr } = await adminClient.from("organizations").select("*");
  console.log("Admin orgs query result:", { count: orgs?.length, orgs, error: orgErr });

  const { data: anonOrgs, error: anonOrgErr } = await anonClient.from("organizations").select("*");
  console.log("Anon orgs query result (RLS test):", { count: anonOrgs?.length, anonOrgs, error: anonOrgErr });

  console.log("\n--- Diagnosing Profiles ---");
  const { data: profiles, error: profErr } = await adminClient.from("profiles").select("*");
  console.log("Admin profiles count:", profiles?.length, "error:", profErr);
  if (profiles) {
    console.log("Profiles sample:", profiles.map(p => ({ id: p.id, email: p.email, role: p.role, org: p.organization_id, student_id: p.student_id })));
  }

  console.log("\n--- Diagnosing Auth Users ---");
  const { data: authUsers, error: authErr } = await adminClient.auth.admin.listUsers();
  console.log("Auth users count:", authUsers?.users?.length, "error:", authErr);
  if (authUsers?.users) {
    console.log("Auth users:", authUsers.users.map(u => ({ id: u.id, email: u.email, meta: u.user_metadata })));
  }

  console.log("\n--- Diagnosing Class Types & Schedules ---");
  const { data: classTypes, error: ctErr } = await adminClient.from("class_types").select("*");
  console.log("Class types count:", classTypes?.length, "error:", ctErr);

  const { data: classSchedules, error: csErr } = await adminClient.from("class_schedules").select("*");
  console.log("Class schedules count:", classSchedules?.length, "error:", csErr);

  console.log("\n--- Diagnosing Students ---");
  const { data: students, error: studErr } = await adminClient.from("students").select("id, id_socio, nombre_completo, email, telefono_raw").limit(5);
  console.log("Students sample count:", students?.length, "error:", studErr);

  console.log("\n--- Diagnosing Reservations ---");
  const { data: reservations, error: resErr } = await adminClient.from("reservations").select("*").limit(5);
  console.log("Reservations sample count:", reservations?.length, "error:", resErr);
}

diagnose().catch(console.error);
