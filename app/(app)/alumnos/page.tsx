"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { withSignals } from "@/lib/selectors";
import { Avatar } from "@/components/ui/Avatar";
import { CuotaBadge, RiesgoBadge } from "@/components/students/StatusBadges";
import { EmptyState } from "@/components/ui/EmptyState";
import { NoData } from "@/components/NoData";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { relativeDays } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { CuotaEstado } from "@/lib/types";

type EstadoFilter = "all" | CuotaEstado;

const FILTERS: { key: EstadoFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "vigente", label: "Al día" },
  { key: "por_vencer", label: "Por vencer" },
  { key: "vencida", label: "Vencidas" },
  { key: "sin_membresia", label: "Sin membresía" },
];

const PAGE_SIZES = [25, 50, 100];

export default function AlumnosPage() {
  const students = useStore((s) => s.students);
  const config = useStore((s) => s.config);
  const [query, setQuery] = useState("");
  const [estado, setEstado] = useState<EstadoFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return withSignals(students, config)
      .filter((x) => (estado === "all" ? true : x.signals.estadoCuota === estado))
      .filter((x) =>
        q === ""
          ? true
          : x.student.nombreCompleto.toLowerCase().includes(q) ||
            x.student.idSocio.toLowerCase().includes(q) ||
            (x.student.telefonoRaw ?? "").includes(q),
      )
      .sort((a, b) => a.student.nombreCompleto.localeCompare(b.student.nombreCompleto));
  }, [students, config, query, estado]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [query, estado, pageSize]);

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + pageSize);

  if (students.length === 0) return <NoData />;

  return (
    <div className="space-y-5">
      {/* Top Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            placeholder="Buscar por nombre, ID o teléfono…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            aria-label="Buscar alumnos"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setEstado(f.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                estado === f.key
                  ? "border-accent/30 bg-accent/12 text-accent"
                  : "border-border bg-card/50 text-muted hover:text-fg",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {totalRows === 0 ? (
        <EmptyState icon={Users} title="Sin resultados" description="Probá con otro nombre o filtro." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-[16px] border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[12px] uppercase tracking-wide text-faint">
                  <th className="px-4 py-3 font-semibold">Alumno</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Teléfono</th>
                  <th className="hidden px-4 py-3 font-semibold lg:table-cell">Membresía</th>
                  <th className="px-4 py-3 font-semibold">Cuota</th>
                  <th className="hidden px-4 py-3 font-semibold sm:table-cell">Última visita</th>
                  <th className="px-4 py-3 font-semibold">Riesgo</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map(({ student, signals }) => (
                  <tr
                    key={student.id}
                    className="group border-b border-border/60 transition-colors last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-2.5">
                      <Link href={`/alumnos/${student.id}`} className="flex items-center gap-3">
                        <Avatar nombre={student.nombre} apellido={student.apellido} size={34} />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-fg group-hover:text-accent">
                            {student.nombreCompleto}
                          </div>
                          <div className="tnum text-[12px] text-faint">#{student.idSocio}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="tnum hidden px-4 py-2.5 text-muted md:table-cell">
                      {student.telefonoRaw ?? "—"}
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted lg:table-cell">
                      {student.membresia ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <CuotaBadge estado={signals.estadoCuota} />
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted sm:table-cell">
                      {student.ultimaAsistencia ? relativeDays(student.ultimaAsistencia) : "Sin datos"}
                    </td>
                    <td className="px-4 py-2.5">
                      <RiesgoBadge nivel={signals.riesgo} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
            <div className="text-[13px] text-muted">
              Mostrando <span className="font-medium text-fg">{startIndex + 1}</span> a{" "}
              <span className="font-medium text-fg">
                {Math.min(startIndex + pageSize, totalRows)}
              </span>{" "}
              de <span className="font-medium text-fg">{totalRows}</span> alumnos
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-[13px] text-muted">
                <span>Filas:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-lg border border-border bg-card px-2 py-1 text-[13px] text-fg focus:border-accent focus:outline-none"
                  aria-label="Cantidad de alumnos por página"
                >
                  {PAGE_SIZES.map((sz) => (
                    <option key={sz} value={sz}>
                      {sz}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  aria-label="Página anterior"
                >
                  <ChevronLeft size={16} />
                </Button>
                <span className="text-[13px] text-muted px-1.5">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Página siguiente"
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}