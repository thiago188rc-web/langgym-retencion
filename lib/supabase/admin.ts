import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * STRICTLY SERVER-SIDE ONLY: Admin Supabase client with service_role privileges.
 * NEVER import or invoke this file in client components or client bundles.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("CRITICAL SECURITY ERROR: createAdminClient cannot be executed on the client-side.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL on server.");
  }

  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
