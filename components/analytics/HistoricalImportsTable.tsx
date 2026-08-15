"use client";

import type { PeriodMetric } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Database, FileSpreadsheet, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { formatShortDate } from "@/lib/dates";

interface HistoricalImportsTableProps {
  data: PeriodMetric[];
}

export function HistoricalImportsTable({ data }: HistoricalImportsTableProps) {
  if (!data || data.length === 0) {
    return null;
  }

  // Display recent first in the table
  const reversedData = [...data].reverse();

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border p-5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-accent/12 text-accent">
            <Database size={16} />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-fg">Historial de Importaciones y Comparativas</h3>
            <p className="text-[13px] text-muted">
              Evolución cronológica calculada a partir de los archivos Excel de SIGA
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border/80 bg-white/[0.01]">
              <TableHead className="font-semibold">Período / Fecha</TableHead>
              <TableHead className="font-semibold">Archivo Excel</TableHead>
              <TableHead className="text-right font-semibold">Alumnos Totales</TableHead>
              <TableHead className="text-right font-semibold">Altas Nuevas</TableHead>
              <TableHead className="text-right font-semibold">Bajas Detectadas</TableHead>
              <TableHead className="text-right font-semibold">Variación Neta</TableHead>
              <TableHead className="text-right font-semibold">Retención</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reversedData.map((item, index) => {
              const isFirstHistorical = index === reversedData.length - 1;

              return (
                <TableRow key={item.periodKey} className="hover:bg-white/[0.02]">
                  <TableCell>
                    <div className="font-medium text-fg">{item.label}</div>
                    <div className="font-mono text-[11px] text-faint">
                      {formatShortDate(item.fecha)}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet size={14} className="text-accent/80 shrink-0" />
                      <span className="truncate max-w-[180px] font-mono text-[12px] text-muted" title={item.archivo}>
                        {item.archivo}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="text-right">
                    <span className="font-mono text-[14px] font-semibold text-fg">{item.total}</span>
                  </TableCell>

                  <TableCell className="text-right">
                    <span className="font-mono text-[13px] font-medium text-info">
                      +{item.altas}
                    </span>
                  </TableCell>

                  <TableCell className="text-right">
                    {isFirstHistorical && reversedData.length === 1 ? (
                      <span className="text-[12px] text-faint italic">Base inicial</span>
                    ) : (
                      <span className="font-mono text-[13px] font-medium text-danger">
                        -{item.bajas}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    {isFirstHistorical && reversedData.length === 1 ? (
                      <span className="text-[12px] text-faint italic">—</span>
                    ) : item.neto > 0 ? (
                      <span className="inline-flex items-center gap-0.5 font-mono text-[13px] font-bold text-accent">
                        <ArrowUpRight size={13} />
                        +{item.neto}
                      </span>
                    ) : item.neto < 0 ? (
                      <span className="inline-flex items-center gap-0.5 font-mono text-[13px] font-bold text-danger">
                        <ArrowDownRight size={13} />
                        {item.neto}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 font-mono text-[13px] text-muted">
                        <Minus size={12} /> 0
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    {item.tasaRetencion != null ? (
                      <Badge
                        tone={
                          item.tasaRetencion >= 90
                            ? "success"
                            : item.tasaRetencion >= 75
                            ? "warning"
                            : "danger"
                        }
                        className="font-mono"
                      >
                        {item.tasaRetencion}%
                      </Badge>
                    ) : (
                      <span className="text-[12px] text-faint italic">Base inicial</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
