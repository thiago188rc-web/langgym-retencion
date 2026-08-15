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
    let targetOrgId: string | null = process.env.PRIMARY_ORG_ID || process.env.DEFAULT_ORGANIZATION_ID || null;

    if (!targetOrgId) {
      const { data: orgs, error: orgError } = (await (supabaseAdmin.from("organizations") as any)
        .select("id, name")
        .order("created_at", { ascending: true })
        .limit(1)) as { data: { id: string; name: string }[] | null; error: any };

      if (orgError || !orgs || orgs.length === 0) {
        console.error("No organization found in database during client registration:", orgError);
        return NextResponse.json(
          {
            success: false,
            error: "El gimnasio no se encuentra configurado en el sistema. Contactá a la administración del gimnasio para que complete la inicialización de la cuenta.",
            code: "ORGANIZATION_NOT_INITIALIZED",
          },
          { status: 422 },
        );
      }
      targetOrgId = orgs[0].id;
    }

    // 4. Create User in Supabase Auth
    let userId: string | null = null;
    let isExistingAuthUser = false;

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
      const errMsg = (authError.message || "").toLowerCase();
      const isAlreadyRegistered =
        errMsg.includes("already") ||
        errMsg.includes("exists") ||
        errMsg.includes("duplicate") ||
        errMsg.includes("registered");

      if (isAlreadyRegistered) {
        // Try to find the existing auth user to ensure their profile is properly linked
        try {
          const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = usersData?.users?.find(
            (u) => u.email?.toLowerCase() === cleanEmail,
          );

          if (existingUser) {
            userId = existingUser.id;
            isExistingAuthUser = true;
            // Update password & user_metadata in case they are completing registration
            await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
              password: password,
              user_metadata: {
                full_name: fullName,
                phone: cleanPhone,
                registered_as: "cliente",
              },
            });
          }
        } catch (listErr) {
          console.warn("Could not list users during recovery:", listErr);
        }

        if (!userId) {
          return NextResponse.json(
            {
              success: false,
              error: "Ya existe una cuenta con este correo electrónico. Por favor iniciá sesión.",
              code: "ALREADY_REGISTERED",
            },
            { status: 409 },
          );
        }
      } else {
        console.error("Error creating auth user:", authError);
        return NextResponse.json(
          { success: false, error: "No se pudo registrar la cuenta. Verificá los datos ingresados." },
          { status: 400 },
        );
      }
    } else if (authData?.user) {
      userId = authData.user.id;
    }

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "No se pudo obtener el identificador de usuario." },
        { status: 500 },
      );
    }

    // 5. Strict & Safe SIGA Student Linking
    // Strategy:
    // 1. Exact normalized email match in the organization.
    // 2. Unambiguous exact phone match (minimum 10 digits).
    // 3. If multiple matches exist -> DO NOT auto-link (leave for manual staff linking).
    // 4. If student record is already linked to another profile -> DO NOT claim.
    let matchedStudentId: string | null = null;
    const phoneDigits = cleanPhone.replace(/\D/g, "");

    try {
      // Priority 1: Match by exact normalized email
      const { data: emailMatches } = (await (supabaseAdmin.from("students") as any)
        .select("id")
        .eq("organization_id", targetOrgId)
        .ilike("email", cleanEmail)) as { data: { id: string }[] | null };

      if (emailMatches && emailMatches.length === 1) {
        matchedStudentId = emailMatches[0].id;
      } else if (!emailMatches || emailMatches.length === 0) {
        // Priority 2: Match by exact normalized phone (only if 10+ digits to ensure full number with area code)
        if (phoneDigits.length >= 10) {
          const arIntlPhone = phoneDigits.startsWith("54") ? phoneDigits : `549${phoneDigits.replace(/^0+/, "")}`;
          const localDigits = phoneDigits.slice(-10); // Standard 10-digit AR number (area code + number)

          const { data: phoneMatches } = (await (supabaseAdmin.from("students") as any)
            .select("id")
            .eq("organization_id", targetOrgId)
            .or(`telefono.eq.${arIntlPhone},telefono.eq.${phoneDigits},telefono_raw.ilike.%${localDigits}%`)) as { data: { id: string }[] | null };

          // STRICT CHECK: Only link if there is EXACTLY 1 unique match across the organization
          if (phoneMatches && phoneMatches.length === 1) {
            matchedStudentId = phoneMatches[0].id;
          }
        }
      }

      // Priority 3: Conflict Prevention
      // Check if this student is already claimed by another active user profile
      if (matchedStudentId) {
        const { data: existingProfileLink } = (await (supabaseAdmin.from("profiles") as any)
          .select("id")
          .eq("student_id", matchedStudentId)
          .neq("id", userId)
          .limit(1)) as { data: { id: string }[] | null };

        if (existingProfileLink && existingProfileLink.length > 0) {
          // Prevent account hijacking: student record is already linked to another user account
          console.warn(`Student ${matchedStudentId} is already linked to another profile. Skipping auto-link.`);
          matchedStudentId = null;
        }
      }
    } catch (matchErr) {
      console.warn("Student matching warning (non-fatal):", matchErr);
      matchedStudentId = null;
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

      // Avoid leaving an orphaned auth.users row (account exists, no profile)
      // when we were the ones who just created it in this request — that
      // limbo state is exactly what let clients slip into the admin panel
      // via an unrecognized role. Existing accounts (isExistingAuthUser) are
      // left untouched since deleting them would destroy a real login.
      if (!isExistingAuthUser) {
        try {
          await supabaseAdmin.auth.admin.deleteUser(userId);
        } catch (cleanupErr) {
          console.error("Failed to roll back orphaned auth user:", cleanupErr);
        }
      }

      return NextResponse.json(
        {
          success: false,
          error: "Error al configurar el perfil de cliente. Por favor reintentá en unos minutos o contactá al gimnasio.",
          code: profileError.code || "PROFILE_UPSERT_FAILED",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: isExistingAuthUser
        ? "Cuenta actualizada e iniciada correctamente."
        : "Registro exitoso.",
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


