"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { NAV_MAIN, NAV_SECONDARY, type NavItem } from "./nav";
import { useStore } from "@/lib/store";
import { computeMetrics } from "@/lib/retention";

function useCounts() {
  const students = useStore((s) => s.students);
  const config = useStore((s) => s.config);
  const m = computeMetrics(students, config);
  return {
    "/recuperacion": m.ausentes7 + m.ausentes15 + m.ausentes30 + m.ausentes30plus,
    "/cobros": m.vencidas + m.venceHoy,
  } as Record<string, number>;
}

function NavLink({
  item,
  active,
  count,
}: {
  item: NavItem;
  active: boolean;
  count?: number;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "group relative flex h-10 items-center gap-3 rounded-[11px] px-3 text-sm font-medium transition-colors duration-150",
        active ? "text-fg" : "text-muted hover:text-fg hover:bg-white/[0.03]",
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 -z-10 rounded-[11px] bg-accent/12 ring-1 ring-accent/25"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
      {active && (
        <motion.span
          layoutId="nav-active-bar"
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent glow-accent-sm"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
      <Icon
        size={18}
        strokeWidth={2}
        className={cn("shrink-0 transition-colors", active ? "text-accent" : "text-faint group-hover:text-muted")}
      />
      <span className="flex-1">{item.label}</span>
      {count != null && count > 0 && (
        <span
          className={cn(
            "tnum rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
            active ? "bg-accent/20 text-accent" : "bg-white/[0.06] text-muted",
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const counts = useCounts();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col border-r border-border bg-surface/50">
      <div className="px-4 pb-2 pt-5">
        <Logo />
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3 pt-4">
        <span className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
          Operación
        </span>
        {NAV_MAIN.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} count={counts[item.href]} />
        ))}

        <span className="px-3 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-wider text-faint">
          Sistema
        </span>
        {NAV_SECONDARY.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>

      <div className="px-3 pb-4">
        <div className="rounded-[12px] border border-border bg-card/60 p-3">
          <p className="text-[12px] leading-relaxed text-muted">
            <span className="font-semibold text-fg">Tip:</span> importá tu Excel de SIGA todas las
            noches para ver quién dejó de venir.
          </p>
        </div>
      </div>
    </aside>
  );
}