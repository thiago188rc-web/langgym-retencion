import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nombre, apellido, email, telefono, password } = body;

    // 1. Basic Server-side validations
    if (!nombre || typeof nombre !== "string" || nombre.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "El nombre es obligatorio." },
        { status: 400 },
      );
    }

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "Ingresá un correo electrónico válido." },
        { status: 400 },
      );
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { success: false, error: "La contraseña debe tener al menos 6 caracteres." },
        { status: 400 },
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanNombre = nombre.trim();
    const cleanApellido = (apellido || "").trim();
    const fullName = cleanApellido ? `${cleanNombre} ${cleanApellido}` : cleanNombre;
    const cleanPhone = (telefono || "").trim();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing SUPABASE credentials in server environment");
      return NextResponse.json(
        { success: false, error: "Error de configuración en el servidor." },
        { status: 500 },
      );
    }

    // 2. Initialize Supabase Admin client
    const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 3. Resolve Organization securely on the server (never from client request)
    const { data: orgs, error: orgError } = (await (supabaseAdmin.from("organizations") as any)
      .select("id, name")
      .order("created_at", { ascending: true })
      .limit(1)) as { data: { id: string; name: string }[] | null; error: any };

    if (orgError || !orgs || orgs.length === 0) {
      console.error("No organization found in database:", orgError);
      return NextResponse.json(
        { success: false, error: "No se encontró el gimnasio en el sistema." },
        { status: 500 },
      );
    }

    const targetOrgId = orgs[0].id;

    // 4. Create User in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone: cleanPhone,
        registered_as: "cliente",
      },
    });

    if (authError) {
      console.error("Error creating auth user:", authError);
      const errMsg = authError.message.toLowerCase();
      if (errMsg.includes("already registered") || errMsg.includes("user already exists")) {
        return NextResponse.json(
          { success: false, error: "Ya existe una cuenta con este correo electrónico." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { success: false, error: "No se pudo registrar la cuenta. Verificá los datos." },
        { status: 400 },
      );
    }

    const userId = authData.user.id;

    // 5. Check if single unambiguous matching student exists in SIGA students table
    let matchedStudentId: string | null = null;
    const cleanDigits = cleanPhone.replace(/\D/g, "");

    try {
      // Priority 1: Match by exact normalized email
      const { data: emailMatches } = (await (supabaseAdmin.from("students") as any)
        .select("id")
        .eq("organization_id", targetOrgId)
        .ilike("email", cleanEmail)) as { data: { id: string }[] | null };

      if (emailMatches && emailMatches.length === 1) {
        matchedStudentId = emailMatches[0].id;
      } else if (!emailMatches || emailMatches.length === 0) {
        // Priority 2: If no email match, match by phone digits (last 8 digits) if unique
        if (cleanDigits.length >= 8) {
          const suffix = cleanDigits.slice(-8);
          const { data: phoneMatches } = (await (supabaseAdmin.from("students") as any)
            .select("id")
            .eq("organization_id", targetOrgId)
            .ilike("telefono_raw", `%${suffix}%`)) as { data: { id: string }[] | null };

          if (phoneMatches && phoneMatches.length === 1) {
            matchedStudentId = phoneMatches[0].id;
          }
        }
      }
    } catch (matchErr) {
      console.warn("Student matching warning (non-fatal):", matchErr);
    }

    // 6. Upsert user profile strictly with role = 'cliente'
    const { error: profileError } = await (supabaseAdmin.from("profiles") as any).upsert({
      id: userId,
      organization_id: targetOrgId,
      email: cleanEmail,
      full_name: fullName,
      role: "cliente",
      student_id: matchedStudentId,
      phone: cleanPhone || null,
    });

    if (profileError) {
      console.error("Error upserting profile:", profileError);
      return NextResponse.json(
        { success: false, error: "Error al crear el perfil de cliente." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Registro exitoso.",
      isLinked: Boolean(matchedStudentId),
      user: {
        id: userId,
        email: cleanEmail,
        fullName,
      },
    });
  } catch (err: any) {
    console.error("Unexpected error in register-client route:", err);
    return NextResponse.json(
      { success: false, error: "Ocurrió un error inesperado al procesar el registro." },
      { status: 500 },
    );
  }
}

