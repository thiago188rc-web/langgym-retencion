"use client";

import { Loader2 } from "lucide-react";

export function PanelLoading() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card/40 py-24">
      <Loader2 size={24} className="animate-spin text-accent" />
      <span className="text-[13px] text-muted">Cargando datos actualizados…</span>
    </div>
  );
}
