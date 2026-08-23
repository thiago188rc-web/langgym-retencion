"use client";

import { History, Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { HISTORICO_CUTOFF_MONTHS } from "@/lib/retention";

export function HistoricoFilterBanner({
  totalCount,
  relevantCount,
}: {
  totalCount: number;
  relevantCount: number;
}) {
  const showHistorico = useStore((s) => s.showHistorico);
  const setShowHistorico = useStore((s) => s.setShowHistorico);
  const hiddenCount = totalCount - relevantCount;

  if (hiddenCount <= 0 && !showHistorico) return null;

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-border bg-surface/60 px-4 py-3 text-[13px]">
      <Users size={15} className="text-faint shrink-0" />
      <span className="text-muted">
        {showHistorico ? (
          <>Mostrando el <strong className="text-fg">histórico completo</strong> ({totalCount} socios).</>
        ) : (
          <>
            Mostrando <strong className="text-fg">{relevantCount}</strong> socios con vencimiento en los últimos{" "}
            {HISTORICO_CUTOFF_MONTHS} meses (de {totalCount} en total).
          </>
        )}
      </span>
      <button
        type="button"
        onClick={() => setShowHistorico(!showHistorico)}
        className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[12px] font-semibold text-accent transition-colors hover:border-accent/40"
      >
        <History size={13} />
        {showHistorico ? "Ver solo recientes" : `Ver histórico completo (${hiddenCount})`}
      </button>
    </div>
  );
}
