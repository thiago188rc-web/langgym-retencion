"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { BajaStudent } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/Table";
import { UserMinus, Search, Clock, MessageSquare, ChevronRight } from "lucide-react";
import { WhatsappButton } from "@/components/students/WhatsappButton";
import { formatShortDate } from "@/lib/dates";

interface BajasListProps {
  bajas: BajaStudent[];
}

export function BajasList({ bajas }: BajasListProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return bajas;
    const q = search.toLowerCase();
    return bajas.filter(
      (b) =>
        b.nombreCompleto.toLowerCase().includes(q) ||
        b.idSocio.toLowerCase().includes(q) ||
        (b.telefono && b.telefono.includes(q)) ||
        (b.ultimaMembresia && b.ultimaMembresia.toLowerCase().includes(q)),
    );
  }, [bajas, search]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-danger/12 text-danger">
            <UserMinus size={16} />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-fg">
              Alumnos que dejaron de aparecer en el Excel ({bajas.length})
            </h3>
            <p className="text-[13px] text-muted">
              Socios activos en importaciones anteriores que no figuran en el último padrón de SIGA
            </p>
          </div>
        </div>

        <div className="w-full sm:w-64">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input
              type="text"
              placeholder="Buscar por nombre o socio…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>
        </div>
      </div>

      {bajas.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-sm text-muted">
            No se detectaron bajas respecto a la importación previa. 🎉
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-sm text-muted">
            No se encontraron alumnos con el término de búsqueda.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/80 bg-white/[0.01]">
                <TableHead className="font-semibold">Socio / Alumno</TableHead>
                <TableHead className="font-semibold">Último Estado SIGA</TableHead>
                <TableHead className="font-semibold">Última Asistencia</TableHead>
                <TableHead className="font-semibold">Último Seguimiento</TableHead>
                <TableHead className="text-right font-semibold">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((b) => {
                const s = b.student;

                return (
                  <TableRow key={s.id} className="hover:bg-white/[0.02]">
                    <TableCell>
                      <Link
                        href={`/alumnos/${s.id}`}
                        className="group flex flex-col font-medium text-fg hover:text-accent"
                      >
                        <span className="transition-colors group-hover:underline">
                          {b.nombreCompleto}
                        </span>
                        <span className="font-mono text-[11px] text-faint">
                          Socio #{b.idSocio} {b.ultimaMembresia ? `· ${b.ultimaMembresia}` : ""}
                        </span>
                      </Link>
                    </TableCell>

                    <TableCell>
                      <div className="space-y-1">
                        <Badge tone="danger" className="text-[11px]">
                          {b.ultimoEstado}
                        </Badge>
                        {b.ultimoVencimiento && (
                          <div className="text-[11px] text-muted">
                            Vencía: <span className="font-mono text-fg">{b.ultimoVencimiento}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5 text-[13px] text-muted">
                        <Clock size={13} className="text-faint" />
                        {b.diasSinVenir != null ? (
                          <span>
                            Hace <span className="font-semibold font-mono text-fg">{b.diasSinVenir}</span> días
                          </span>
                        ) : (
                          <span className="text-faint italic">Sin registro</span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      {b.ultimoSeguimiento ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1 text-[12px] font-medium text-fg">
                            <MessageSquare size={12} className="text-accent" />
                            <span>{b.ultimoSeguimiento.tipo === "nota" ? "Nota" : "WhatsApp"}</span>
                            <span className="text-faint text-[10px]">
                              ({formatShortDate(b.ultimoSeguimiento.fecha)})
                            </span>
                          </div>
                          {b.ultimoSeguimiento.mensaje && (
                            <p className="line-clamp-1 max-w-[200px] text-[11px] text-muted">
                              {b.ultimoSeguimiento.mensaje}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-[12px] text-faint italic">Sin contactos previos</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {s.telefono && (
                          <WhatsappButton
                            student={s}
                            tipo="recuperacion"
                            compact
                            label="WhatsApp"
                          />
                        )}
                        <Link
                          href={`/alumnos/${s.id}`}
                          className="flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted transition-colors hover:border-accent/40 hover:text-fg"
                          title="Ver ficha completa"
                        >
                          <ChevronRight size={15} />
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
