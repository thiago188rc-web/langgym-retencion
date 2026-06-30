import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-[16px] border border-dashed border-border px-6 py-16 text-center",
        className,
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
        <Icon size={24} strokeWidth={1.75} />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
        {description && <p className="mx-auto max-w-sm text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
