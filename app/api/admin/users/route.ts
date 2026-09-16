import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

const ADMIN_MAINTENANCE_KEY = process.env.ADMIN_MAINTENANCE_KEY || "langgym_maint_2026_andres";

async function isAuthorizedAdmin(request: NextRequest): Promise<boolean> {
  // 1. Secret header for direct maintenance / scripts
  const headerKey = request.headers.get("x-admin-key");
  if (headerKey && headerKey === ADMIN_MAINTENANCE_KEY) {
    return true;
  }

  // 2. Cookie session check for logged in admin or profesor
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return false;

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {},
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    return profile?.role === "admin" || profile?.role === "profesor";
  } catch {
    return false;
  }
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase credentials in server environment");
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// GET: List users with profiles & student link status
export async function GET(request: NextRequest) {
  try {
    const authorized = await isAuthorizedAdmin(request);
    if (!authorized) {
      return NextResponse.json({ success: false, error: "No autorizado." }, { status: 401 });
    }

    const supabaseAdmin = getAdminClient();
    const search = request.nextUrl.searchParams.get("search")?.toLowerCase().trim() || "";

    // 1. Fetch auth users
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 500,
    });
    if (authError) {
      console.error("Error listing auth users:", authError);
    }
    const authUsers = authData?.users || [];

    // 2. Fetch profiles
    const { data: profiles, error: profError } = await (supabaseAdmin.from("profiles") as any)
      .select("*")
      .order("created_at", { ascending: false });

    // 3. Fetch students
    const { data: students } = await (supabaseAdmin.from("students") as any)
      .select("id, id_socio, nombre_completo, email, telefono, telefono_raw");

    const studentMap = new Map<string, any>((students || []).map((s: any) => [s.id, s]));
    const profileMap = new Map<string, any>((profiles || []).map((p: any) => [p.id, p]));

    // Combine users
    const combined: Array<{
      id: string;
      email: string;
      fullName: string;
      phone: string | null;
      role: string;
      studentId: string | null;
      studentName: string | null;
      studentIdSocio: string | null;
      createdAt: string;
      lastSignInAt: string | null;
    }> = authUsers.map((u) => {
      const prof: any = profileMap.get(u.id);
      const student: any = prof?.student_id ? studentMap.get(prof.student_id) : null;
      return {
        id: u.id,
        email: u.email || prof?.email || "",
        fullName: prof?.full_name || u.user_metadata?.full_name || "Sin nombre",
        phone: prof?.phone || u.user_metadata?.phone || null,
        role: prof?.role || "cliente",
        studentId: prof?.student_id || null,
        studentName: student?.nombre_completo || null,
        studentIdSocio: student?.id_socio || null,
        createdAt: u.created_at || prof?.created_at,
        lastSignInAt: u.last_sign_in_at || null,
      };
    });

    // Also include any profiles that might not be in auth users
    for (const profItem of (profiles || []) as any[]) {
      if (!combined.some((c) => c.id === profItem.id)) {
        const student: any = profItem.student_id ? studentMap.get(profItem.student_id) : null;
        combined.push({
          id: profItem.id,
          email: profItem.email || "",
          fullName: profItem.full_name || "Sin nombre",
          phone: profItem.phone || null,
          role: profItem.role || "cliente",
          studentId: profItem.student_id || null,
          studentName: student?.nombre_completo || null,
          studentIdSocio: student?.id_socio || null,
          createdAt: profItem.created_at,
          lastSignInAt: null,
        });
      }
    }

    // Filter if search query provided
    const filtered = search
      ? combined.filter(
          (u) =>
            u.email.toLowerCase().includes(search) ||
            u.fullName.toLowerCase().includes(search) ||
            (u.phone && u.phone.includes(search)) ||
            (u.studentName && u.studentName.toLowerCase().includes(search)) ||
            (u.studentIdSocio && u.studentIdSocio.toLowerCase().includes(search)),
        )
      : combined;

    return NextResponse.json({
      success: true,
      count: filtered.length,
      users: filtered,
    });
  } catch (err: any) {
    console.error("Error in GET /api/admin/users:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Error al obtener usuarios." },
      { status: 500 },
    );
  }
}

// POST: Actions (delete_user, unlink_student, link_student, get_env_sync)
export async function POST(request: NextRequest) {
  try {
    const authorized = await isAuthorizedAdmin(request);
    if (!authorized) {
      return NextResponse.json({ success: false, error: "No autorizado." }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;
    const supabaseAdmin = getAdminClient();

    // ACTION: get_env_sync
    if (action === "get_env_sync") {
      const headerKey = request.headers.get("x-admin-key");
      if (headerKey !== ADMIN_MAINTENANCE_KEY) {
        return NextResponse.json({ success: false, error: "Clave de mantenimiento requerida." }, { status: 403 });
      }
      return NextResponse.json({
        success: true,
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      });
    }

    // ACTION: delete_user
    if (action === "delete_user") {
      const { userId } = body;
      if (!userId || typeof userId !== "string") {
        return NextResponse.json(
          { success: false, error: "Falta el ID del usuario a eliminar." },
          { status: 400 },
        );
      }

      console.log(`[Admin] Deleting user account: ${userId}`);

      // 1. Delete associated enrollment requests
      try {
        await (supabaseAdmin.from("class_enrollment_requests") as any)
          .delete()
          .eq("user_id", userId);
      } catch (err) {
        console.warn("Could not delete enrollment requests:", err);
      }

      // 2. Delete reservations
      try {
        await (supabaseAdmin.from("reservations") as any)
          .delete()
          .eq("user_id", userId);
      } catch (err) {
        console.warn("Could not delete reservations by user_id:", err);
      }

      // 3. Delete profile
      try {
        await (supabaseAdmin.from("profiles") as any)
          .delete()
          .eq("id", userId);
      } catch (err) {
        console.warn("Could not delete profile:", err);
      }

      // 4. Delete Supabase Auth User
      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (deleteAuthError) {
        console.error("Error deleting auth user:", deleteAuthError);
        return NextResponse.json(
          {
            success: false,
            error: `No se pudo eliminar el usuario de autenticación: ${deleteAuthError.message}`,
          },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        message: "Usuario eliminado correctamente. Ahora puede volver a registrarse.",
        deletedUserId: userId,
      });
    }

    // ACTION: unlink_student
    if (action === "unlink_student") {
      const { userId } = body;
      if (!userId) {
        return NextResponse.json({ success: false, error: "Falta userId." }, { status: 400 });
      }

      const { error } = await (supabaseAdmin.from("profiles") as any)
        .update({ student_id: null })
        .eq("id", userId);

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: "Socio desvinculado con éxito." });
    }

    // ACTION: link_student
    if (action === "link_student") {
      const { userId, studentId } = body;
      if (!userId || !studentId) {
        return NextResponse.json(
          { success: false, error: "Faltan userId o studentId." },
          { status: 400 },
        );
      }

      const { error } = await (supabaseAdmin.from("profiles") as any)
        .update({ student_id: studentId })
        .eq("id", userId);

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: "Socio vinculado con éxito." });
    }

    // ACTION: update_profile
    if (action === "update_profile") {
      const { userId, fullName, phone, email } = body;
      if (!userId) {
        return NextResponse.json({ success: false, error: "Falta userId." }, { status: 400 });
      }

      const updates: any = {};
      if (fullName) updates.full_name = fullName;
      if (phone !== undefined) updates.phone = phone;
      if (email) updates.email = email;

      const { error } = await (supabaseAdmin.from("profiles") as any)
        .update(updates)
        .eq("id", userId);

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      if (fullName || phone) {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            ...(fullName ? { full_name: fullName } : {}),
            ...(phone !== undefined ? { phone } : {}),
          },
        }).catch(() => {});
      }

      return NextResponse.json({ success: true, message: "Perfil actualizado con éxito." });
    }

    return NextResponse.json({ success: false, error: "Acción no reconocida." }, { status: 400 });
  } catch (err: any) {
    console.error("Error in POST /api/admin/users:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Error al procesar la acción." },
      { status: 500 },
    );
  }
}
