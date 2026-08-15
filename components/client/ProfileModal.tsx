"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { User, Mail, Phone, ShieldCheck, Link2, AlertCircle } from "lucide-react";
import type { Database } from "@/lib/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export function ProfileModal({
  profile,
  open,
  onClose,
}: {
  profile: Profile | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!profile) return null;

  const isLinked = Boolean(profile.student_id);

  return (
    <Modal open={open} onClose={onClose} title="Mi Perfil de Alumno" maxWidth={440}>
      <div className="space-y-5">
        {/* User Info Details */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-3.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-accent-gradient glow-accent-sm text-white shrink-0">
              <User size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-fg truncate text-sm">{profile.full_name}</span>
                <Badge tone="accent">Cliente</Badge>
              </div>
              <span className="text-xs text-muted block truncate">{profile.email}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 text-xs">
            <div className="flex items-center justify-between rounded-lg border border-border/70 bg-bg/50 px-3.5 py-2.5">
              <span className="text-muted flex items-center gap-2">
                <Mail size={14} className="text-faint" /> Correo
              </span>
              <span className="font-medium text-fg">{profile.email}</span>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/70 bg-bg/50 px-3.5 py-2.5">
              <span className="text-muted flex items-center gap-2">
                <Phone size={14} className="text-faint" /> Teléfono
              </span>
              <span className="font-medium text-fg">{profile.phone || "No especificado"}</span>
            </div>
          </div>
        </div>

        {/* Student Linking (SIGA) Status */}
        <div className="rounded-xl border border-border bg-card/40 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-fg flex items-center gap-1.5">
              <Link2 size={14} className="text-accent" /> Ficha de Socio (SIGA)
            </span>
            {isLinked ? (
              <Badge tone="success">Vinculada</Badge>
            ) : (
              <Badge tone="warning">Pendiente</Badge>
            )}
          </div>

          {isLinked ? (
            <p className="text-xs text-muted">
              Tu cuenta está correctamente asociada a tu ficha de alumno en el sistema de gestión del gimnasio.
            </p>
          ) : (
            <div className="flex items-start gap-2 pt-1 text-xs text-muted">
              <AlertCircle size={15} className="text-warning shrink-0 mt-0.5" />
              <span>
                Tu cuenta todavía no está vinculada a tu ficha de alumno. El staff de Lang Gym la asociará con tu pase.
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto">
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
