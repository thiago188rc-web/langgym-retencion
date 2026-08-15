"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Upload, Database, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth/AuthContext";
import { relativeDays } from "@/lib/dates";

const TITLES: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Central de Retención", subtitle: "Qué pasa hoy con tus alumnos" },
  "/recuperacion": { title: "Recuperación", subtitle: "Alumnos que dejaron de venir" },
  "/cobros": { title: "Cobros", subtitle: "Cuotas por vencer y vencidas" },
  "/alumnos": { title: "Alumnos", subtitle: "Toda tu base de socios" },
  "/metricas": { title: "Métricas", subtitle: "Cómo evoluciona la retención" },
  "/importar": { title: "Importar datos", subtitle: "Arrastrá el Excel de tu sistema" },
  "/configuracion": { title: "Configuración", subtitle: "Mensajes, reglas y marca" },
};

function metaFor(pathname: string) {
  if (pathname.startsWith("/alumnos/")) return { title: "Ficha del alumno", subtitle: "Historial y seguimiento" };
  const key = Object.keys(TITLES).find((k) => (k === "/" ? pathname === "/" : pathname.startsWith(k)));
  return TITLES[key ?? "/"];
}

export function Header() {
  const pathname = usePathname();
  const meta = metaFor(pathname);
  const lastImport = useStore((s) => s.imports[0]);
  const { user, profile, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border glass px-6">
      <div className="min-w-0">
        <h1 className="truncate text-[17px] font-semibold tracking-tight text-fg">{meta.title}</h1>
        <p className="truncate text-[13px] text-muted">{meta.subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        {lastImport ? (
          <div className="hidden items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-[12px] text-muted sm:flex">
            <Database size={13} className="text-faint" />
            <span>
              Importado <span className="text-fg">{relativeDays(lastImport.fecha.slice(0, 10))}</span>
            </span>
          </div>
        ) : null}

        <Link href="/importar">
          <Button variant="primary" size="md">
            <Upload size={16} />
            <span className="hidden sm:inline">Importar Excel</span>
          </Button>
        </Link>

        {user && (
          <div className="flex items-center gap-2 border-l border-border/80 pl-3">
            <div className="hidden flex-col text-right lg:flex">
              <span className="text-[12px] font-medium text-fg truncate max-w-[140px]">
                {profile?.full_name || user.email}
              </span>
              <span className="text-[10px] text-faint uppercase tracking-wider">
                {profile?.role || "Staff"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="flex size-9 items-center justify-center rounded-xl border border-border bg-card/60 text-muted transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger active:scale-95"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}