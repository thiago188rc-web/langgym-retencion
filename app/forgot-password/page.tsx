"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Dumbbell, Mail, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const supabase = createClient();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);

    try {
      const redirectUrl = `${window.location.origin}/reset-password`;
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl,
      });
    } catch {
      // Intentionally silent / generic to avoid email enumeration
    } finally {
      setSubmitted(true);
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
          <p className="mt-1 text-[13px] text-muted">Recuperación de contraseña</p>
        </div>

        <Card className="p-6">
          {submitted ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
                <CheckCircle2 size={24} />
              </div>
              <h2 className="text-[16px] font-semibold text-fg">Revisá tu correo</h2>
              <p className="text-[13px] leading-relaxed text-muted">
                Si la dirección <strong className="text-fg">{email}</strong> está registrada en el sistema, recibirás un enlace seguro para restablecer tu contraseña.
              </p>
              <div className="pt-2">
                <Link href="/login">
                  <Button variant="secondary" className="w-full justify-center">
                    <ArrowLeft size={15} /> Volver a Iniciar sesión
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <h2 className="text-[16px] font-semibold text-fg">¿Olvidaste tu contraseña?</h2>
                <p className="mt-1 text-[13px] text-muted">
                  Ingresá tu correo electrónico y te enviaremos un enlace para recuperarla.
                </p>
              </div>

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

              <Button
                type="submit"
                variant="primary"
                className="w-full justify-center"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Enviando enlace…
                  </>
                ) : (
                  "Enviar instrucciones"
                )}
              </Button>

              <div className="pt-1 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-fg transition-colors"
                >
                  <ArrowLeft size={13} /> Volver al inicio de sesión
                </Link>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
