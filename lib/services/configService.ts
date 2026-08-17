import { createClient } from "@/lib/supabase/client";
import type { Config } from "@/lib/types";

export async function fetchConfigFromSupabase(organizationId: string): Promise<Config | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("configurations")
    .select("*")
    .eq("organization_id", organizationId)
    .single();

  if (error || !data) {
    return null;
  }

  // Fetch gym name / branding from organization
  const { data: org } = await supabase
    .from("organizations")
    .select("name, owner_name, logo_url, country_code, mobile_prefix, owner_whatsapp")
    .eq("id", organizationId)
    .single();

  return {
    gymName: org?.name || "Lang Gym",
    ownerName: org?.owner_name || "Staff",
    logoDataUrl: org?.logo_url || null,
    countryCode: org?.country_code || "54",
    mobilePrefix: org?.mobile_prefix || "9",
    ownerWhatsapp: org?.owner_whatsapp || "",
    diasRiesgo: {
      nivel1: data.dias_riesgo_nivel1,
      nivel2: data.dias_riesgo_nivel2,
      nivel3: data.dias_riesgo_nivel3,
    },
    porVencerDias: data.por_vencer_dias,
    templates: {
      recuperacion: data.template_recuperacion,
      cobro: data.template_cobro,
    },
  };
}

export async function saveConfigToSupabase(
  organizationId: string,
  config: Partial<Config>,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // 1. Update configuration table
  const configUpdates: Record<string, unknown> = {};
  if (config.diasRiesgo?.nivel1 !== undefined) configUpdates.dias_riesgo_nivel1 = config.diasRiesgo.nivel1;
  if (config.diasRiesgo?.nivel2 !== undefined) configUpdates.dias_riesgo_nivel2 = config.diasRiesgo.nivel2;
  if (config.diasRiesgo?.nivel3 !== undefined) configUpdates.dias_riesgo_nivel3 = config.diasRiesgo.nivel3;
  if (config.porVencerDias !== undefined) configUpdates.por_vencer_dias = config.porVencerDias;
  if (config.templates?.recuperacion !== undefined) configUpdates.template_recuperacion = config.templates.recuperacion;
  if (config.templates?.cobro !== undefined) configUpdates.template_cobro = config.templates.cobro;

  if (Object.keys(configUpdates).length > 0) {
    const { error: cfgErr } = await supabase
      .from("configurations")
      .upsert(
        {
          organization_id: organizationId,
          ...configUpdates,
        },
        { onConflict: "organization_id" },
      );

    if (cfgErr) {
      return { success: false, error: "No se pudo guardar la configuración de reglas." };
    }
  }

  // 2. Update organization branding if present
  const orgUpdates: Record<string, unknown> = {};
  if (config.gymName !== undefined) orgUpdates.name = config.gymName;
  if (config.ownerName !== undefined) orgUpdates.owner_name = config.ownerName;
  if (config.logoDataUrl !== undefined) orgUpdates.logo_url = config.logoDataUrl;
  if (config.countryCode !== undefined) orgUpdates.country_code = config.countryCode;
  if (config.mobilePrefix !== undefined) orgUpdates.mobile_prefix = config.mobilePrefix;
  if (config.ownerWhatsapp !== undefined) orgUpdates.owner_whatsapp = config.ownerWhatsapp;

  if (Object.keys(orgUpdates).length > 0) {
    const { error: orgErr } = await supabase
      .from("organizations")
      .update(orgUpdates)
      .eq("id", organizationId);

    if (orgErr) {
      return { success: false, error: "No se pudo actualizar los datos del gimnasio." };
    }
  }

  return { success: true };
}
