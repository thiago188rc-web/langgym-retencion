import { cn, colorFromString, initials } from "@/lib/utils";

export function Avatar({
  nombre,
  apellido,
  size = 40,
  className,
}: {
  nombre: string;
  apellido: string;
  size?: number;
  className?: string;
}) {
  const text = initials(nombre, apellido);
  const color = colorFromString(`${nombre}${apellido}`);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white/95 select-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, ${color}, ${color}aa)`,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.08), 0 2px 8px ${color}33`,
      }}
      aria-hidden
    >
      {text}
    </div>
  );
}
