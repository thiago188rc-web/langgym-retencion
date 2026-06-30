"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-[12px] border border-border bg-surface/60 px-3.5 text-sm text-fg placeholder:text-faint " +
  "transition-all duration-150 outline-none " +
  "focus:border-accent/50 focus:ring-2 focus:ring-accent/20 hover:border-border-strong";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(base, "h-10", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(base, "py-2.5 leading-relaxed resize-none", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-faint">{hint}</span>}
    </label>
  );
}
