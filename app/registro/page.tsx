"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dumbbell, Lock, Mail, User, Phone, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

export default function RegisterPage() {
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validations
    if (!nombre.trim()) {
      setErrorMsg("Por favor ingresá tu nombre.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setErrorMsg("Por favor ingresá un correo electrónico válido.");
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

    try {
      // 1. Call server-side registration endpoint (creates auth user + cliente profile)
      const res = await fetch("/api/auth/register-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          apellido: apellido.trim(),
          email: email.trim(),
          telefono: telefono.trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "No se pudo completar el registro. Verificá los datos.");
        setLoading(false);
        return;
      }

      setSuccessMsg("¡Cuenta creada con éxito! Iniciando sesión…");

      // 2. Automatically log the client in
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (loginError) {
        // If automatic login fails for any reason, redirect to login page
        router.push("/login");
        return;
      }

      router.push("/mi-panel");
      router.refresh();
    } catch {
      setErrorMsg("Ocurrió un error inesperado de conexión. Por favor reintentá.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-8">
      <div className="w-full max-w-[440px] space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-accent-gradient glow-accent">
            <Dumbbell size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Lang Gym</h1>
          <p className="mt-1 text-[13px] text-muted">
            Creá tu cuenta de alumno para reservar tus clases
          </p>
        </div>

        {/* Register Card */}
        <Card className="p-6">
          <h2 className="mb-5 text-[16px] font-semibold text-fg">Registro de Alumno</h2>

          {errorMsg && (
            <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-danger/25 bg-danger/10 p-3 text-[13px] text-danger">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-[13px] text-emerald-400">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nombre">
                <div className="relative">
                  <Input
                    type="text"
                    placeholder="Juan"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    required
                    autoComplete="given-name"
                    className="pl-9"
                    disabled={loading}
                  />
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                </div>
              </Field>

              <Field label="Apellido">
                <Input
                  type="text"
                  placeholder="Pérez"
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                  autoComplete="family-name"
                  disabled={loading}
                />
              </Field>
            </div>

            <Field label="Correo electrónico">
              <div className="relative">
                <Input
                  type="email"
                  placeholder="juan.perez@ejemplo.com"
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

            <Field label="Teléfono / WhatsApp (opcional)">
              <div className="relative">
                <Input
                  type="tel"
                  placeholder="11 2345 6789"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  autoComplete="tel"
                  className="pl-9"
                  disabled={loading}
                />
                <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              </div>
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Contraseña">
                <div className="relative">
                  <Input
                    type="password"
                    placeholder="Mínimo 6 caracteres"
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
                    placeholder="Repetí tu contraseña"
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
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center mt-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creando cuenta…
                </>
              ) : (
                "Crear mi cuenta"
              )}
            </Button>
          </form>

          <div className="mt-5 text-center text-[13px] text-muted">
            ¿Ya tenés cuenta?{" "}
            <Link
              href="/login"
              className="font-medium text-accent hover:text-accent-hover transition-colors"
            >
              Iniciar sesión
            </Link>
          </div>
        </Card>

        {/* Security Notice Footer */}
        <p className="text-center text-[12px] text-faint">
          Tus datos están protegidos y solo serán utilizados para tus reservas en Lang Gym.
        </p>
      </div>
    </div>
  );
}
