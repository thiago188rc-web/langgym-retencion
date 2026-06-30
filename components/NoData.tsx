"use client";

import Link from "next/link";
import { Sparkles, Upload } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { buildDemoStudents } from "@/lib/demo";

export function NoData({
  title = "Todavía no hay datos",
  description = "Importá el Excel que exportás de SIGA y en segundos vas a ver quién dejó de venir y a quién escribirle hoy.",
}: {
  title?: string;
  description?: string;
}) {
  const loadStudents = useStore((s) => s.loadStudents);
  const push = useToast((s) => s.push);
  return (
    <EmptyState
      icon={Upload}
      title={title}
      description={description}
      className="py-24"
      action={
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/importar">
            <Button variant="primary">
              <Upload size={16} /> Importar Excel
            </Button>
          </Link>
          <Button
            variant="ghost"
            onClick={() => {
              loadStudents(buildDemoStudents());
              push("Datos de ejemplo cargados", "success");
            }}
          >
            <Sparkles size={15} /> Ver con datos de ejemplo
          </Button>
        </div>
      }
    />
  );
}