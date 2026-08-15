"use client";

import { useMemo, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, HeartPulse } from "lucide-react";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { getAusentes, groupByBucket } from "@/lib/selectors";
import { StudentCard } from "@/components/students/StudentCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { NoData } from "@/components/NoData";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { AusenciaBucket } from "@/lib/retention";

type Filter = "all" | AusenciaBucket;

const TABS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "7", label: "+7 días" },
  { key: "15", label: "+15 días" },
  { key: "30", label: "+30 días" },
  { key: "30plus", label: "Más de 30" },
];

const PAGE_SIZE = 18;

export default function RecuperacionPage() {
  const students = useStore((s) => s.students);
  const config = useStore((s) => s.config);
  const [filter, setFilter] = useState<Filter>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const { items, groups } = useMemo(() => {
    const items = getAusentes(students, config);
    return { items, groups: groupByBucket(items) };
  }, [students, config]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  if (students.length === 0) return <NoData />;

  const counts: Record<Filter, number> = {
    all: items.length,
    "7": groups["7"].length,
    "15": groups["15"].length,
    "30": groups["30"].length,
    "30plus": groups["30plus"].length,
  };

  const visible = filter === "all" ? items : groups[filter];
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedVisible = visible.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              "relative inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium transition-colors",
              filter === tab.key
                ? "border-accent/30 bg-accent/12 text-accent"
                : "border-border bg-card/50 text-muted hover:text-fg hover:border-border-strong",
            )}
          >
            {tab.label}
            <span
              className={cn(
                "tnum rounded-full px-1.5 text-[11px] font-semibold",
                filter === tab.key ? "bg-accent/20" : "bg-white/[0.06]",
              )}
            >
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={HeartPulse}
          title="Nadie en esta categoría"
          description="Cuando un alumno deje de venir los días configurados, va a aparecer acá listo para contactar."
        />
      ) : (
        <>
          <motion.div layout className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {paginatedVisible.map((item, i) => (
              <StudentCard key={item.student.id} student={item.student} variant="recuperacion" index={i} />
            ))}
          </motion.div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-border/50 text-[13px] text-muted">
              <div>
                Mostrando {startIndex + 1}–{Math.min(startIndex + PAGE_SIZE, visible.length)} de {visible.length} alumnos
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
                <span className="px-2">
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
          )}
        </>
      )}
    </div>
  );
}