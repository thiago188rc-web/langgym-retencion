"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { useStore } from "@/lib/store";
import { migrateLocalStorageToSupabase } from "@/lib/services/migrationService";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Organization = Database["public"]["Tables"]["organizations"]["Row"];

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  organization: Organization | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  organization: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const syncFromSupabase = useStore((s) => s.syncFromSupabase);

  const supabase = createClient();

  const loadUserData = useCallback(async (currentUser: User | null) => {
    if (!currentUser) {
      setProfile(null);
      setOrganization(null);
      setLoading(false);
      return;
    }

    try {
      // 1. Fetch user profile
      const { data: prof, error: profError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .single();

      if (profError || !prof) {
        setProfile(null);
        setOrganization(null);
        setLoading(false);
        return;
      }

      setProfile(prof);

      // 2. Fetch user organization
      const { data: org } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", prof.organization_id)
        .single();

      if (org) {
        setOrganization(org);

        // Only sync admin data store if user is staff/admin/owner (clients don't download students database)
        if (prof.role !== "cliente") {
          // Check if there is pending localStorage data to migrate to Supabase
          if (typeof window !== "undefined") {
            const migrationKey = `langgym_migrated_${org.id}`;
            const alreadyMigrated = localStorage.getItem(migrationKey);
            if (!alreadyMigrated) {
              try {
                const rawLocal = localStorage.getItem("langgym-store");
                if (rawLocal) {
                  const parsed = JSON.parse(rawLocal);
                  const localStudents = parsed?.state?.students || [];
                  const localConfig = parsed?.state?.config;
                  if (localStudents.length > 0) {
                    await migrateLocalStorageToSupabase(org.id, localStudents, localConfig);
                  }
                }
                localStorage.setItem(migrationKey, new Date().toISOString());
              } catch (mErr) {
                console.warn("Migration warning:", mErr);
              }
            }
          }

          // 3. Sincronizar datos de Supabase hacia Zustand Store para administradores
          await syncFromSupabase(org.id);
        }
      }
    } catch (err) {
      console.warn("Error loading user profile / org:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, syncFromSupabase]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        setUser(currentUser);
        await loadUserData(currentUser);
      } catch {
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      await loadUserData(currentUser);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, loadUserData]);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      // Clear in-memory and local storage store to prevent data leaks across sessions
      useStore.getState().reset();
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem("langgym-store");
        } catch {}
      }
      setUser(null);
      setProfile(null);
      setOrganization(null);
      router.push("/login");
      router.refresh();
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await loadUserData(user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        organization,
        loading,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
