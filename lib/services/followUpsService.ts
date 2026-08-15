import { createClient } from "@/lib/supabase/client";
import type { FollowUp, FollowUpResultado } from "@/lib/types";

export async function createFollowUpInSupabase(
  organizationId: string,
  studentId: string,
  followUp: Omit<FollowUp, "id">,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("follow_ups")
    .insert({
      organization_id: organizationId,
      student_id: studentId,
      user_id: user?.id ?? null,
      fecha: followUp.fecha,
      tipo: followUp.tipo,
      canal: followUp.canal,
      mensaje: followUp.mensaje,
      resultado: followUp.resultado,
    })
    .select("id")
    .single();

  if (error) {
    return { success: false, error: "No se pudo registrar el seguimiento." };
  }

  return { success: true, id: data?.id };
}

export async function updateFollowUpResultadoInSupabase(
  organizationId: string,
  followUpId: string,
  resultado: FollowUpResultado,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { error } = await supabase
    .from("follow_ups")
    .update({ resultado })
    .eq("id", followUpId)
    .eq("organization_id", organizationId);

  if (error) {
    return { success: false, error: "No se pudo actualizar el estado del seguimiento." };
  }

  return { success: true };
}
