"use client";

import { useState } from "react";
import { Dumbbell, AlertTriangle, Loader2, RefreshCw, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/**
 * Controlled landing page for authenticated users whose `profiles` row is
 * missing or has an unrecognized role. This is a deliberate safety net —
 * see lib/auth/roleRouting.ts. These users must NEVER be routed into the
 * administrative panel just because their role couldn't be determined.
 */
export default function PerfilPendientePage() {
  const { user, loading, signOut, refreshProfile } = useAuth();
  const [checking, setChecking] = useState(false);

  const handleRetry = async () => {
    setChecking(true);
    try {
      await refreshProfile();
      // If the profile is now complete, middleware/AuthContext-driven
      // navigation on the next request will move the user to the right home.
      window.location.reload();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-8">
      <div className="w-full max-w-[440px] space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-accent-gradient glow-accent">
            <Dumbbell size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Lang Gym</h1>
        </div>

        <Card className="p-6 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
            <AlertTriangle size={22} />
          </div>
          <h2 className="mb-2 text-[16px] font-semibold text-fg">
            Tu cuenta todavía se está configurando
          </h2>
          <p className="mb-5 text-[13px] text-muted">
            Iniciaste sesión correctamente, pero tu perfil aún no está listo. Esto
            puede pasar justo después de registrarte. Probá de nuevo en unos
            segundos; si el problema persiste, contactá al gimnasio.
          </p>

          {user?.email && (
            <p className="mb-5 text-[12px] text-faint">
              Sesión iniciada como <span className="font-medium">{user.email}</span>
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="primary"
              className="w-full justify-center"
              onClick={handleRetry}
              disabled={checking || loading}
            >
              {checking ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Verificando…
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  Reintentar
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="secondary"
              className="w-full justify-center"
              onClick={() => signOut()}
            >
              <LogOut size={16} />
              Cerrar sesión
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
