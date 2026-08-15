import fs from "fs";
import path from "path";

// 1. Read environment variables from .env.local
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
  console.error("❌ Error: Faltan las variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  process.exit(1);
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
};

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const fullName = process.argv[4] || "Andrés";
  const gymName = process.argv[5] || "Lang Gym";

  if (!email || !password) {
    console.log("\n================================================================================");
    console.log("🛠️  CREADOR SEGURO DE USUARIO ADMINISTRADOR / STAFF (LANGGYM)");
    console.log("================================================================================");
    console.log("Uso:");
    console.log('  node scripts/create_user.mjs <email> <password> ["Nombre"] ["NombreGimnasio"]\n');
    console.log("Ejemplo:");
    console.log('  node scripts/create_user.mjs andres@langgym.com MiContrasena123 "Andrés" "Lang Gym"\n');
    process.exit(0);
  }

  console.log(`\n⏳ Conectando con Supabase para configurar usuario: ${email}...`);

  try {
    // 1. Check if user already exists
    const listRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      headers,
    });
    const listData = await listRes.json();
    const existing = listData?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());

    let userId = null;

    if (existing) {
      console.log(`ℹ️  El usuario ${email} ya existe en Supabase Auth (ID: ${existing.id}).`);
      console.log("🔄 Actualizando contraseña y metadatos...");
      const updRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${existing.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          password: password,
          email_confirm: true,
          user_metadata: { full_name: fullName, gym_name: gymName },
        }),
      });
      const updData = await updRes.json();
      if (!updRes.ok) {
        console.error("❌ Error al actualizar usuario:", updData.message || updData);
        process.exit(1);
      }
      userId = updData.id || existing.id;
    } else {
      // 2. Create user
      const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: email.trim(),
          password: password,
          email_confirm: true,
          user_metadata: { full_name: fullName, gym_name: gymName },
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) {
        console.error("❌ Error al crear usuario:", createData.msg || createData.message || createData);
        process.exit(1);
      }
      userId = createData.id;
      console.log(`✅ Usuario creado en Supabase Auth (ID: ${userId}).`);
    }

    // 3. Verify / create profile & organization
    const profRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=*`, {
      headers,
    });
    const profiles = await profRes.json();

    if (Array.isArray(profiles) && profiles.length > 0) {
      console.log("✅ Perfil y Organización vinculados correctamente:");
      console.log(`   - Usuario: ${profiles[0].email} (${profiles[0].full_name})`);
      console.log(`   - Organization ID: ${profiles[0].organization_id}`);
      console.log(`   - Rol: ${profiles[0].role}`);
    } else {
      console.log("ℹ️  Creando Organización y Perfil inicial...");
      const orgRes = await fetch(`${supabaseUrl}/rest/v1/organizations`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({
          name: gymName,
          slug: "lang-gym-" + userId.slice(0, 6),
          owner_name: fullName,
        }),
      });
      const orgs = await orgRes.json();
      const orgId = orgs[0]?.id;

      if (!orgId) {
        console.error("❌ Error creando organización:", orgs);
        process.exit(1);
      }

      await fetch(`${supabaseUrl}/rest/v1/profiles`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: userId,
          organization_id: orgId,
          email: email,
          full_name: fullName,
          role: "owner",
        }),
      });

      await fetch(`${supabaseUrl}/rest/v1/configurations`, {
        method: "POST",
        headers,
        body: JSON.stringify({ organization_id: orgId }),
      });

      console.log(`✅ Organización creada (ID: ${orgId}) y Perfil asignado.`);
    }

    console.log("\n================================================================================");
    console.log(`🎉 ¡LISTO! Usuario activado con éxito: ${email}`);
    console.log("Ya podés iniciar sesión en: https://langgym-retencion.vercel.app/login");
    console.log("================================================================================\n");
  } catch (err) {
    console.error("❌ Error inesperado:", err);
  }
}

main();
