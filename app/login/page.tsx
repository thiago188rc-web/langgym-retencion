"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dumbbell, Lock, Mail, Loader2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg("Por favor completá todos los campos.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        // Safe, non-enumerating error message
        setErrorMsg("Credenciales inválidas. Verificá tu correo y contraseña.");
        return;
      }

      if (data?.user) {
        // Check profile role to redirect to appropriate dashboard
        const { data: prof } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", data.user.id)
          .single();

        if (prof?.role === "cliente") {
          router.push("/mi-panel");
        } else {
          router.push("/");
        }
        router.refresh();
      }
    } catch {
      setErrorMsg("Ocurrió un error inesperado al conectar. Intentalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-8">
      <div className="w-full max-w-[400px] space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-accent-gradient glow-accent">
            <Dumbbell size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Lang Gym</h1>
          <p className="mt-1 text-[13px] text-muted">
            Acceso al sistema y reserva de clases
          </p>
        </div>

        {/* Login Card */}
        <Card className="p-6">
          <h2 className="mb-5 text-[16px] font-semibold text-fg">Iniciar sesión</h2>

          {errorMsg && (
            <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-danger/25 bg-danger/10 p-3 text-[13px] text-danger">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <Field label="Correo electrónico">
              <div className="relative">
                <Input
                  type="email"
                  placeholder="ejemplo@gimnasio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="pl-9"
                  disabled={loading}
                />
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              </div>
            </Field>

            <Field label="Contraseña">
              <div className="relative">
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pl-9"
                  disabled={loading}
                />
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              </div>
            </Field>

            <div className="flex items-center justify-end">
              <Link
                href="/forgot-password"
                className="text-[12px] font-medium text-accent hover:text-accent-hover transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Iniciando sesión…
                </>
              ) : (
                "Ingresar"
              )}
            </Button>
          </form>

          <div className="mt-5 border-t border-border pt-4 text-center text-[13px] text-muted">
            ¿Sos alumno y todavía no tenés cuenta?{" "}
            <Link
              href="/registro"
              className="font-medium text-accent hover:text-accent-hover transition-colors"
            >
              Registrate acá
            </Link>
          </div>
        </Card>

        {/* Security Notice Footer */}
        <p className="text-center text-[12px] text-faint">
          Acceso seguro protegido con aislamiento multi-tenant y cifrado SSL.
        </p>
      </div>
    </div>
  );
}
