"use client";

import { Dumbbell } from "lucide-react";
import { useStore } from "@/lib/store";

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  const config = useStore((s) => s.config);
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-accent-gradient glow-accent-sm">
        {config.logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={config.logoDataUrl}
            alt={config.gymName}
            className="size-9 rounded-[11px] object-cover"
          />
        ) : (
          <Dumbbell size={18} className="text-white" strokeWidth={2.4} />
        )}
      </div>
      {!collapsed && (
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight text-fg">
            {config.gymName}
          </div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-faint">
            Retención
          </div>
        </div>
      )}
    </div>
  );
}