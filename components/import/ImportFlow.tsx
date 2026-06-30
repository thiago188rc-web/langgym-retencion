"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { DropZone } from "./DropZone";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { Card } from "@/components/ui/Card";
import { useStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { parseExcel } from "@/lib/import/parseExcel";
import { buildDemoStudents } from "@/lib/demo";
import type { ColumnMapping, ImportError, CanonicalField } from "@/lib/types";

type Phase = "idle" | "processing" | "done";

interface Outcome {
  archivo: string;
  nuevos: number;
  actualizados: number;
  errores: ImportError[];
  total: number;
  mapping: ColumnMapping;
  recuperados: number;
}

const FIELD_LABELS: Record<CanonicalField, string> = {
  idSocio: "ID Socio",
  nombre: "Nombre",
  habilitado: "Habilitado",
  idMembresia: "ID Membresía",
  membresia: "Membresía",
  fechaFin: "Vencimiento",
  fechaAlta: "Fecha de alta",
  ultimaAsistencia: "Última asistencia",
  email: "Email",
  telefono: "Teléfono",
  celular: "Celular",
  observacion: "Observación",
};

const STAGES = [
  { label: "Leyendo archivo", pct: 12 },
  { label: "Detectando columnas", pct: 38 },
  { label: "Analizando alumnos", pct: 68 },
  { label: "Actualizando base", pct: 92 },
  { label: "Listo", pct: 100 },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ImportFlow() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const applyImport = useStore((s) => s.applyImport);
  const loadStudents = useStore((s) => s.loadStudents);
  const config = useStore((s) => s.config);
  const push = useToast((s) => s.push);

  async function handleFile(file: File) {
    setPhase("processing");
    setStage(0);
    try {
      await sleep(450);
      setStage(1);
      const buffer = await file.arrayBuffer();
      await sleep(450);

      const result = parseExcel(buffer, config);
      setStage(2);
      await sleep(550);

      if (result.mapping.missingRequired.length > 0) {
        push("No pudimos reconocer las columnas obligatorias", "warning");
        setOutcome({
          archivo: file.name,
          nuevos: 0,
          actualizados: 0,
          errores: result.errores,
          total: result.totalFilas,
          mapping: result.mapping,
          recuperados: 0,
        });
        setStage(4);
        setPhase("done");
        return;
      }

      setStage(3);
      const summary = applyImport(result.parsedStudents, file.name, result.errores.length);
      await sleep(500);
      setStage(4);
      await sleep(300);

      setOutcome({
        archivo: file.name,
        nuevos: summary.nuevos,
        actualizados: summary.actualizados,
        errores: result.errores,
        total: result.parsedStudents.length,
        mapping: result.mapping,
        recuperados: summary.recuperadosDetectados,
      });
      setPhase("done");
      push(`Importación lista · ${summary.nuevos} nuevos, ${summary.actualizados} actualizados`, "success");
    } catch {
      push("No pudimos leer el archivo. ¿Es un Excel válido?", "warning");
      setPhase("idle");
    }
  }

  function loadDemo() {
    loadStudents(buildDemoStudents());
    push("Datos de ejemplo cargados", "success");
    setOutcome({
      archivo: "Datos de ejemplo",
      nuevos: 20,
      actualizados: 0,
      errores: [],
      total: 20,
      mapping: { byHeader: {}, byField: {}, unmapped: [], missingRequired: [] },
      recuperados: 0,
    });
    setPhase("done");
  }

  function restart() {
    setPhase("idle");
    setOutcome(null);
    setStage(0);
  }

  return (
    <div className="space-y-5">
      <AnimatePresence mode="wait">
        {phase === "idle" && (
          <motion.div
            key="idle"
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <DropZone onFile={handleFile} />
            <div className="flex items-center justify-center gap-3 text-sm text-muted">
              <span>¿Querés ver cómo se ve con datos?</span>
              <button
                onClick={loadDemo}
                className="inline-flex items-center gap-1.5 font-medium text-accent transition-colors hover:text-accent-hover"
              >
                <Sparkles size={14} />
                Cargar datos de ejemplo
              </button>
            </div>
          </motion.div>
        )}

        {phase === "processing" && (
          <motion.div key="proc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card className="p-8">
              <div className="mx-auto max-w-md space-y-6 text-center">
                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent/12 text-accent">
                  <Loader2 size={26} className="animate-spin" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-fg">{STAGES[stage].label}…</p>
                  <p className="mt-1 text-sm text-muted">Procesando tu archivo de forma segura</p>
                </div>
                <Progress value={STAGES[stage].pct} />
                <div className="flex flex-col gap-1.5">
                  {STAGES.slice(0, 4).map((s, i) => (
                    <div
                      key={s.label}
                      className={`flex items-center gap-2 text-[13px] ${
                        i < stage ? "text-success" : i === stage ? "text-fg" : "text-faint"
                      }`}
                    >
                      {i < stage ? (
                        <CheckCircle2 size={14} />
                      ) : i === stage ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <span className="size-3.5 rounded-full border border-current" />
                      )}
                      {s.label}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {phase === "done" && outcome && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            <ImportSummary outcome={outcome} onRestart={restart} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatTile({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-border bg-card p-4">
      <div className={`flex size-10 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
      <div>
        <div className="tnum text-2xl font-semibold leading-none">{value}</div>
        <div className="mt-1 text-[13px] text-muted">{label}</div>
      </div>
    </div>
  );
}

function ImportSummary({ outcome, onRestart }: { outcome: Outcome; onRestart: () => void }) {
  const failed = outcome.mapping.missingRequired.length > 0;
  const mappedFields = Object.entries(outcome.mapping.byField) as [CanonicalField, string][];

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-4 border-b border-border bg-gradient-to-r from-accent/[0.08] to-transparent px-6 py-5">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-accent-gradient glow-accent-sm">
            {failed ? <AlertTriangle size={24} className="text-white" /> : <CheckCircle2 size={24} className="text-white" />}
          </div>
          <div className="flex-1">
            <h2 className="text-[17px] font-semibold">
              {failed ? "Revisá el archivo" : "Importación completada"}
            </h2>
            <p className="text-sm text-muted">
              {outcome.archivo} · {outcome.total} registros procesados
            </p>
          </div>
          {!failed && (
            <Link href="/">
              <Button variant="primary">
                Ver panel <ArrowRight size={16} />
              </Button>
            </Link>
          )}
        </div>

        <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile icon={<UserPlus size={18} className="text-success" />} value={outcome.nuevos} label="Nuevos" tone="bg-success/12" />
          <StatTile icon={<RefreshCw size={18} className="text-info" />} value={outcome.actualizados} label="Actualizados" tone="bg-info/12" />
          <StatTile icon={<Sparkles size={18} className="text-accent" />} value={outcome.recuperados} label="Recuperados" tone="bg-accent/12" />
          <StatTile icon={<AlertTriangle size={18} className="text-warning" />} value={outcome.errores.length} label="Errores" tone="bg-warning/12" />
        </div>
      </Card>

      {mappedFields.length > 0 && (
        <Card className="p-6">
          <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-muted">
            Columnas detectadas
          </h3>
          <div className="flex flex-wrap gap-2">
            {mappedFields.map(([field, header]) => (
              <div
                key={field}
                className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[13px]"
              >
                <span className="text-faint">{header}</span>
                <ArrowRight size={12} className="text-accent" />
                <span className="font-medium text-fg">{FIELD_LABELS[field]}</span>
              </div>
            ))}
            {outcome.mapping.unmapped.map((h) => (
              <div
                key={h}
                className="flex items-center gap-2 rounded-full border border-dashed border-border px-3 py-1.5 text-[13px] text-faint"
              >
                {h} · ignorada
              </div>
            ))}
          </div>
        </Card>
      )}

      {outcome.errores.length > 0 && (
        <Card className="p-6">
          <h3 className="mb-4 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-warning">
            <AlertTriangle size={15} /> Errores encontrados ({outcome.errores.length})
          </h3>
          <div className="max-h-60 space-y-2 overflow-y-auto">
            {outcome.errores.slice(0, 50).map((e, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg bg-white/[0.02] px-3 py-2 text-[13px]">
                <span className="tnum shrink-0 rounded bg-white/[0.05] px-1.5 py-0.5 text-faint">
                  Fila {e.fila}
                </span>
                <span className="text-muted">{e.motivo}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex justify-center pt-1">
        <Button variant="ghost" onClick={onRestart}>
          <RefreshCw size={15} /> Importar otro archivo
        </Button>
      </div>
    </>
  );
}