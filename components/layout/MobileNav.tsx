"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_MAIN } from "./nav";
import { useStore } from "@/lib/store";
import { computeMetrics } from "@/lib/retention";

function useCounts() {
  const students = useStore((s) => s.students);
  const config = useStore((s) => s.config);

  return useMemo(() => {
    if (students.length === 0) return {};
    const m = computeMetrics(students, config);
    return {
      "/recuperacion": m.ausentes7 + m.ausentes15 + m.ausentes30 + m.ausentes30plus,
      "/cobros": m.vencidas + m.venceHoy,
    } as Record<string, number>;
  }, [students, config]);
}

export function MobileNav() {
  const pathname = usePathname();
  const counts = useCounts();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      aria-label="Navegación principal móvil"
      className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-surface/90 backdrop-blur-md md:hidden"
    >
      {NAV_MAIN.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        const count = counts[item.href];

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors",
              active ? "text-accent" : "text-faint",
            )}
          >
            <div className="relative">
              <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
              {count != null && count > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-white">
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </div>
            <span className="leading-none">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
