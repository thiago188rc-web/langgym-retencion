import {
  LayoutDashboard,
  HeartPulse,
  Wallet,
  Users,
  CalendarCheck,
  ChartColumnBig,
  Upload,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_MAIN: NavItem[] = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/clases", label: "Clases", icon: CalendarCheck },
  { href: "/recuperacion", label: "Recuperación", icon: HeartPulse },
  { href: "/cobros", label: "Cobros", icon: Wallet },
  { href: "/alumnos", label: "Alumnos", icon: Users },
  { href: "/metricas", label: "Métricas", icon: ChartColumnBig },
];

export const NAV_SECONDARY: NavItem[] = [
  { href: "/importar", label: "Importar", icon: Upload },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];