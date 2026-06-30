"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Upload, Database } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
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
            Importar Excel
          </Button>
        </Link>
      </div>
    </header>
  );
}