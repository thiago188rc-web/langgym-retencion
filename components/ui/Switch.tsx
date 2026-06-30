"use client";

import { cn } from "@/lib/utils";

export function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 outline-none",
        "focus-visible:ring-2 focus-visible:ring-accent/40",
        checked ? "bg-accent-gradient glow-accent-sm" : "bg-white/[0.1]",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200 ease-out",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}
