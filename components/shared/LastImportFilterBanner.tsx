"use client";

import { FileSpreadsheet, Users } from "lucide-react";
import { useStore } from "@/lib/store";

export function LastImportFilterBanner({
  totalCount,
  filteredCount,
}: {
  totalCount: number;
  filteredCount: number;
}) {
  const showOnlyLastImport = useStore((s) => s.showOnlyLastImport);
  const setShowOnlyLastImport = useStore((s) => s.setShowOnlyLastImport);
  const latestImportId = useStore((s) => s.latestImportId);

  if (!latestImportId) return null;
  if (!showOnlyLastImport && filteredCount === totalCount) return null;

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-accent/30 bg-accent/[0.06] px-4 py-3 text-[13px]">
      <FileSpreadsheet size={15} className="text-accent shrink-0" />
      <span className="text-muted">
        {showOnlyLastImport ? (
          <>
            Mostrando solo los <strong className="text-fg">{filteredCount}</strong> socios de tu{" "}
            <strong className="text-fg">última importación</strong>.
          </>
        ) : (
          <>
            Viendo <strong className="text-fg">todos los socios</strong> ({totalCount}), no solo la última
            importación.
          </>
        )}
      </span>
      <button
        type="button"
        onClick={() => setShowOnlyLastImport(!showOnlyLastImport)}
        className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[12px] font-semibold text-accent transition-colors hover:border-accent/40"
      >
        <Users size={13} />
        {showOnlyLastImport ? "Ver todos los socios" : "Ver solo la última importación"}
      </button>
    </div>
  );
}
