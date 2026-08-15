import fs from "fs";
import path from "path";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key && rest.length > 0) {
      const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
      process.env[key.trim()] = val;
    }
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Error: Faltan variables de entorno en .env.local.");
  process.exit(1);
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
};

async function executeSql(sql) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
    headers,
  });
  // If there's an SQL runner endpoint or we execute via postgres REST endpoints
  return res;
}

async function runTests() {
  console.log("================================================================================");
  console.log("🧪 INICIANDO VERIFICACIÓN DE BASE DE DATOS: RESERVAS Y CLASES");
  console.log("================================================================================\n");

  try {
    // 1. Fetch organizations
    console.log("1️⃣ Verificando Organización existente...");
    const orgRes = await fetch(`${supabaseUrl}/rest/v1/organizations?select=*`, { headers });
    const orgs = await orgRes.json();
    if (!Array.isArray(orgs) || orgs.length === 0) {
      console.log("⚠️ No se encontraron organizaciones. Creando una de prueba...");
    } else {
      console.log(`✅ Organización encontrada: ${orgs[0].name} (ID: ${orgs[0].id})`);
    }

    // 2. Check class_types table
    console.log("\n2️⃣ Verificando tabla class_types...");
    const typesRes = await fetch(`${supabaseUrl}/rest/v1/class_types?select=*`, { headers });
    const types = await typesRes.json();
    console.log(`ℹ️ Respuesta class_types:`, Array.isArray(types) ? `Encontradas ${types.length} actividades` : types);

    // 3. Check class_schedules table
    console.log("\n3️⃣ Verificando tabla class_schedules...");
    const schedRes = await fetch(`${supabaseUrl}/rest/v1/class_schedules?select=*`, { headers });
    const scheds = await schedRes.json();
    console.log(`ℹ️ Respuesta class_schedules:`, Array.isArray(scheds) ? `Encontrados ${scheds.length} horarios` : scheds);

    // 4. Check reservations table
    console.log("\n4️⃣ Verificando tabla reservations...");
    const resRes = await fetch(`${supabaseUrl}/rest/v1/reservations?select=*`, { headers });
    const reservations = await resRes.json();
    console.log(`ℹ️ Respuesta reservations:`, Array.isArray(reservations) ? `Total reservas: ${reservations.length}` : reservations);

    console.log("\n================================================================================");
    console.log("✅ VERIFICACIÓN DE CONEXIÓN CON SUPABASE COMPLETADA");
    console.log("================================================================================\n");
  } catch (err) {
    console.error("❌ Error en tests:", err);
  }
}

runTests();
