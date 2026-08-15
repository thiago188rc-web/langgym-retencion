"use client";

import { Dumbbell, LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function ClientHeader({
  organizationName,
  displayName,
  onOpenProfile,
  onSignOut,
}: {
  organizationName: string;
  displayName: string;
  onOpenProfile: () => void;
  onSignOut: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-accent-gradient glow-accent-sm">
            <Dumbbell size={18} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-fg">
                {organizationName || "Lang Gym"}
              </span>
            </div>
            <span className="text-[11px] text-faint">Reserva de Clases</span>
          </div>
        </div>

        {/* User Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenProfile}
            className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-1.5 text-xs text-muted hover:border-accent/40 hover:text-fg transition-all"
            title="Ver mi perfil"
          >
            <UserIcon size={14} className="text-accent" />
            <span className="max-w-[120px] truncate font-medium">{displayName}</span>
          </button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onSignOut}
            className="text-muted hover:text-danger px-2.5"
            title="Cerrar sesión"
          >
            <LogOut size={16} />
          </Button>
        </div>
      </div>
    </header>
  );
}
