import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conditional logic. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Stable id generator (no external dep). */
export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/** Spanish-friendly capitalization for names: "JUAN PEREZ" -> "Juan Perez". */
export function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase())
    .trim();
}

/** Initials for avatar fallback. */
export function initials(nombre: string, apellido: string): string {
  const a = (nombre || "").trim()[0] ?? "";
  const b = (apellido || "").trim()[0] ?? "";
  const result = `${a}${b}`.toUpperCase();
  return result || "?";
}

/** Deterministic accent-ish color from a string (for avatars). */
export function colorFromString(value: string): string {
  const palette = [
    "#FF6B00",
    "#FF8F33",
    "#4DA3FF",
    "#2ED477",
    "#FFB020",
    "#A78BFA",
    "#F472B6",
    "#22D3EE",
  ];
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("es-AR").format(n);
}
