import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Student = Database["public"]["Tables"]["students"]["Row"];

export interface UnlinkedClientProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  createdAt: string;
  suggestedMatch: {
    studentId: string;
    idSocio: string;
    nombreCompleto: string;
    email: string | null;
    telefono: string | null;
    matchReason: "email" | "telefono" | "socio";
  } | null;
}

/**
 * 1. Get all client accounts that are not yet linked to a SIGA student record (Staff / Admin only)
 */
export async function getUnlinkedClientProfiles(): Promise<{
  data: UnlinkedClientProfile[];
  error: string | null;
}> {
  try {
    const supabase = createClient();

    // 1. Fetch unlinked client profiles
    const { data: profiles, error: profError } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, created_at, organization_id")
      .eq("role", "cliente")
      .is("student_id", null)
      .order("created_at", { ascending: false });

    if (profError) {
      console.error("Error fetching unlinked profiles:", profError);
      return { data: [], error: "No se pudieron obtener las cuentas sin vincular." };
    }

    if (!profiles || profiles.length === 0) {
      return { data: [], error: null };
    }

    // 2. Fetch students to find potential matches
    const { data: students } = await supabase
      .from("students")
      .select("id, id_socio, nombre_completo, email, telefono, telefono_raw");

    const studentList = students || [];

    const result: UnlinkedClientProfile[] = profiles.map((prof) => {
      const cleanEmail = (prof.email || "").toLowerCase().trim();
      const cleanDigits = (prof.phone || "").replace(/\D/g, "");

      let match: UnlinkedClientProfile["suggestedMatch"] = null;

      // Find by email
      const emailMatch = studentList.find(
        (s) => s.email && s.email.toLowerCase().trim() === cleanEmail,
      );

      if (emailMatch) {
        match = {
          studentId: emailMatch.id,
          idSocio: emailMatch.id_socio,
          nombreCompleto: emailMatch.nombre_completo,
          email: emailMatch.email,
          telefono: emailMatch.telefono,
          matchReason: "email",
        };
      } else if (cleanDigits.length >= 8) {
        // Find by phone suffix
        const suffix = cleanDigits.slice(-8);
        const phoneMatch = studentList.find(
          (s) => s.telefono_raw && s.telefono_raw.includes(suffix),
        );
        if (phoneMatch) {
          match = {
            studentId: phoneMatch.id,
            idSocio: phoneMatch.id_socio,
            nombreCompleto: phoneMatch.nombre_completo,
            email: phoneMatch.email,
            telefono: phoneMatch.telefono,
            matchReason: "telefono",
          };
        }
      }

      return {
        id: prof.id,
        fullName: prof.full_name,
        email: prof.email,
        phone: prof.phone,
        createdAt: prof.created_at,
        suggestedMatch: match,
      };
    });

    return { data: result, error: null };
  } catch (err: any) {
    console.error("Unexpected error in getUnlinkedClientProfiles:", err);
    return { data: [], error: "Ocurrió un error al consultar las cuentas sin vincular." };
  }
}

/**
 * 2. Link a client account to a SIGA student record (Staff / Admin only)
 */
export async function linkClientToStudent(
  profileId: string,
  studentId: string,
): Promise<{ success: boolean; message?: string; error: string | null }> {
  try {
    const supabase = createClient();

    // Call atomic RPC
    const { data: rpcRes, error: rpcError } = await supabase.rpc("link_profile_to_student", {
      p_profile_id: profileId,
      p_student_id: studentId,
    });

    if (rpcError) {
      console.error("RPC error in link_profile_to_student:", rpcError);
      return { success: false, error: rpcError.message || "No se pudo vincular la cuenta." };
    }

    const parsed = rpcRes as { success: boolean; message?: string; error?: string };
    return {
      success: parsed?.success ?? true,
      message: parsed?.message,
      error: parsed?.error || null,
    };
  } catch (err: any) {
    console.error("Unexpected error in linkClientToStudent:", err);
    return { success: false, error: "Error inesperado al vincular la cuenta." };
  }
}

/**
 * 3. Unlink a client account from a SIGA student record (Staff / Admin only)
 */
export async function unlinkClientFromStudent(
  profileId: string,
): Promise<{ success: boolean; message?: string; error: string | null }> {
  try {
    const supabase = createClient();

    const { data: rpcRes, error: rpcError } = await supabase.rpc("unlink_profile_from_student", {
      p_profile_id: profileId,
    });

    if (rpcError) {
      console.error("RPC error in unlink_profile_from_student:", rpcError);
      return { success: false, error: rpcError.message || "No se pudo desvincular la cuenta." };
    }

    const parsed = rpcRes as { success: boolean; message?: string; error?: string };
    return {
      success: parsed?.success ?? true,
      message: parsed?.message,
      error: parsed?.error || null,
    };
  } catch (err: any) {
    console.error("Unexpected error in unlinkClientFromStudent:", err);
    return { success: false, error: "Error inesperado al desvincular la cuenta." };
  }
}
