"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/ui/CountUp";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const toneStyles: Record<Tone, { icon: string; value: string }> = {
  neutral: { icon: "bg-white/[0.05] text-muted", value: "text-fg" },
  accent: { icon: "bg-accent/12 text-accent", value: "text-fg" },
  success: { icon: "bg-success/12 text-success", value: "text-fg" },
  warning: { icon: "bg-warning/12 text-warning", value: "text-fg" },
  danger: { icon: "bg-danger/12 text-danger", value: "text-fg" },
  info: { icon: "bg-info/12 text-info", value: "text-fg" },
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  href,
  hint,
  suffix,
  highlight,
  index = 0,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: Tone;
  href?: string;
  hint?: string;
  suffix?: string;
  highlight?: boolean;
  index?: number;
}) {
  const styles = toneStyles[tone];

  const inner = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: Math.min(index * 0.04, 0.4) }}
      className={cn(
        "group relative h-full overflow-hidden rounded-[16px] border bg-card p-5 transition-all duration-200",
        highlight ? "border-accent/30 glow-accent-sm" : "border-border",
        href && "hover:-translate-y-0.5 hover:border-border-strong hover:bg-card-hover",
      )}
    >
      {highlight && (
        <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-accent/10 blur-2xl" />
      )}
      <div className="flex items-start justify-between">
        <div className={cn("flex size-10 items-center justify-center rounded-xl", styles.icon)}>
          <Icon size={19} strokeWidth={2} />
        </div>
        {href && (
          <ArrowUpRight
            size={16}
            className="text-faint opacity-0 transition-opacity group-hover:opacity-100"
          />
        )}
      </div>
      <div className="mt-4">
        <div className={cn("text-[32px] font-semibold leading-none tracking-tight", styles.value)}>
          <CountUp value={value} suffix={suffix} />
        </div>
        <div className="mt-2 text-[13px] font-medium text-muted">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-faint">{hint}</div>}
      </div>
    </motion.div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}