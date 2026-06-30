import { cn } from "@/lib/utils";

export function Card({
  className,
  glow,
  hover,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { glow?: boolean; hover?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[16px] border border-border bg-card shadow-card",
        hover && "transition-all duration-200 ease-out hover:bg-card-hover hover:border-border-strong",
        glow && "border-accent/30 glow-accent-sm",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-between gap-3 px-5 pt-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-[13px] font-semibold uppercase tracking-wide text-muted", className)}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}
