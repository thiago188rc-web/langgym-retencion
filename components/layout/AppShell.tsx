"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dumbbell } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";
import { ToastViewport } from "@/components/ui/Toast";
import { useHydrated } from "@/lib/useHydrated";
import { useAuth } from "@/lib/auth/AuthContext";

function BootScreen() {
  return (
    <div className="flex h-dvh items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-4">
        <div className="flex size-12 animate-pulse items-center justify-center rounded-2xl bg-accent-gradient glow-accent">
          <Dumbbell size={24} className="text-white" />
        </div>
        <span className="text-sm text-faint">Cargando Lang Gym…</span>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile && profile.role === "cliente") {
      router.replace("/mi-panel");
    }
  }, [loading, profile, router]);

  if (!hydrated || loading || (profile && profile.role === "cliente")) {
    return <BootScreen />;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1240px] px-4 py-5 pb-24 md:px-6 md:py-7 md:pb-7">{children}</div>
        </main>
      </div>
      <MobileNav />
      <ToastViewport />
    </div>
  );
}