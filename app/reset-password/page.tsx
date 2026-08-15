"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dumbbell, Lock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) {
      setErrorMsg("Por favor completá todos los campos.");
      return;
    }

    if (password.length < 6) {
      setErrorMsg("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        setErrorMsg("No pudimos actualizar tu contraseña. El enlace puede haber expirado.");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 2500);
    } catch {
      setErrorMsg("Ocurrió un error inesperado al conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-8">
      <div className="w-full max-w-[400px] space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-accent-gradient glow-accent">
            <Dumbbell size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Lang Gym</h1>
          <p className="mt-1 text-[13px] text-muted">Establecer nueva contraseña</p>
        </div>

        <Card className="p-6">
          {success ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
                <CheckCircle2 size={24} />
              </div>
              <h2 className="text-[16px] font-semibold text-fg">¡Contraseña actualizada!</h2>
              <p className="text-[13px] text-muted">
                Tu contraseña fue cambiada con éxito. Redirigiendo al sistema…
              </p>
            </div>
          ) : (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <h2 className="text-[16px] font-semibold text-fg">Nueva contraseña</h2>
                <p className="mt-1 text-[13px] text-muted">
                  Ingresá una contraseña segura para tu cuenta.
                </p>
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2.5 rounded-xl border border-danger/25 bg-danger/10 p-3 text-[13px] text-danger">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <Field label="Nueva contraseña" hint="Mínimo 6 caracteres">
                <div className="relative">
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="pl-9"
                    disabled={loading}
                  />
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                </div>
              </Field>

              <Field label="Confirmar contraseña">
                <div className="relative">
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="pl-9"
                    disabled={loading}
                  />
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                </div>
              </Field>

              <Button
                type="submit"
                variant="primary"
                className="w-full justify-center"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Guardando contraseña…
                  </>
                ) : (
                  "Guardar nueva contraseña"
                )}
              </Button>

              <div className="pt-1 text-center">
                <Link
                  href="/login"
                  className="text-[12px] font-medium text-muted hover:text-fg transition-colors"
                >
                  Volver al inicio de sesión
                </Link>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
