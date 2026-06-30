"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "subtle" | "danger" | "success";
type Size = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-accent-gradient text-white font-medium hover:brightness-110 hover:glow-accent-sm active:brightness-95 shadow-[0_4px_14px_rgba(255,107,0,0.25)]",
  secondary:
    "bg-card text-fg border border-border-strong hover:bg-card-hover hover:border-[#3f4754]",
  ghost: "text-muted hover:text-fg hover:bg-white/[0.04]",
  subtle: "bg-white/[0.04] text-fg hover:bg-white/[0.07] border border-transparent",
  danger: "bg-danger/15 text-danger border border-danger/25 hover:bg-danger/25",
  success: "bg-success/15 text-success border border-success/25 hover:bg-success/25",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[10px]",
  md: "h-10 px-4 text-sm gap-2 rounded-[12px]",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-[14px]",
  icon: "h-9 w-9 rounded-[10px] justify-center",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap font-medium",
          "transition-all duration-150 ease-out outline-none",
          "focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-0",
          "disabled:opacity-40 disabled:pointer-events-none select-none",
          "active:scale-[0.98]",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
