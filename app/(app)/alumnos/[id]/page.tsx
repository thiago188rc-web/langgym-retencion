"use client";

import { useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  CalendarPlus,
  Check,
  Clock,
  IdCard,
  Mail,
  MessageCircle,
  NotebookPen,
  Phone,
  Plus,
  Activity,
  Send,
  Sparkles,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { getSignals } from "@/lib/retention";
import { cobroMessage, recuperacionMessage, renderTemplate } from "@/lib/whatsapp";
import { formatDate, relativeDays, isSameMonth } from "@/lib/dates";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { CuotaBadge, RiesgoBadge } from "@/components/students/StatusBadges";
import { WhatsappButton } from "@/components/students/WhatsappButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { VariableToolbar, insertAtCursor } from "@/components/ui/VariableToolbar";
import type { FollowUp } from "@/lib/types";

const FU_META: Record<string, { label: string; icon: typeof MessageCircle; tone: string }> = {
  recuperacion: { label: "Recuperación", icon: MessageCircle, tone: "text-accent bg-accent/12" },
  cobro: { label: "Cobro", icon: CalendarClock, tone: "text-warning bg-warning/12" },
  nota: { label: "Nota", icon: NotebookPen, tone: "text-info bg-info/12" },
};
const RESULT_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  contactado: "Contactado",
  recuperado: "Recuperado",
  sin_respuesta: "Sin respuesta",
};

function DataRow({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Icon size={15} className="text-faint" />
      <span className="w-28 shrink-0 text-[13px] text-muted">{label}</span>
      <span className="truncate text-sm text-fg">{value}</span>
    </div>
  );
}

function StatBox({ icon: Icon, value, label, tone }: { icon: typeof Clock; value: string; label: string; tone: string }) {
  return (
    <div className="rounded-[14px] border border-border bg-card p-4">
      <div className={`mb-2 flex size-9 items-center justify-center rounded-lg ${tone}`}>
        <Icon size={17} />
      </div>
      <div className="text-lg font-semibold tnum">{value}</div>
      <div className="text-[12px] text-muted">{label}</div>
    </div>
  );
}

function TimelineItem({
  fu,
  onResolve,
}: {
  fu: FollowUp;
  onResolve: (resultado: "recuperado" | "sin_respuesta") => void;
}) {
  const meta = FU_META[fu.tipo] ?? FU_META.nota;
  const Icon = meta.icon;
  return (
    <div className="relative flex gap-3 pb-5 last:pb-0">
      <div className="relative flex flex-col items-center">
        <div className={`flex size-8 items-center justify-center rounded-full ${meta.tone}`}>
          <Icon size={15} />
        </div>
        <span className="mt-1 w-px flex-1 bg-border" />
      </div>
      <div className="flex-1 pt-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-fg">{meta.label}</span>
          <span className="text-[12px] text-faint">· {relativeDays(fu.fecha.slice(0, 10))}</span>
        </div>
        <div className="mt-0.5 text-[13px] text-muted">
          {fu.canal === "whatsapp" ? "Mensaje de WhatsApp enviado" : "Nota manual"} ·{" "}
          <span className={fu.resultado === "recuperado" ? "text-success" : "text-faint"}>
            {RESULT_LABEL[fu.resultado]}
          </span>
        </div>
        {fu.mensaje && (
          <p className="mt-1.5 whitespace-pre-line rounded-lg bg-white/[0.02] px-3 py-2 text-[13px] text-muted">
            {fu.mensaje}
          </p>
        )}
        {(fu.resultado === "contactado" || fu.resultado === "pendiente") && fu.tipo !== "nota" && (
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="success" onClick={() => onResolve("recuperado")}>
              <Check size={14} /> Volvió
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onResolve("sin_respuesta")}>
              Sin respuesta
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

import { useAuth } from "@/lib/auth/AuthContext";

export default function FichaPage() {
  const params = useParams<{ id: string }>();
  const students = useStore((s) => s.students);
  const config = useStore((s) => s.config);
  const addFollowUp = useStore((s) => s.addFollowUp);
  const setFollowUpResultado = useStore((s) => s.setFollowUpResultado);
  const push = useToast((s) => s.push);
  const { organization } = useAuth();
  const [note, setNote] = useState("");

  const student = useMemo(() => students.find((s) => s.id === params.id), [students, params.id]);

  // Message composer state
  const [messageMode, setMessageMode] = useState<"recuperacion" | "cobro" | "custom">("recuperacion");
  const [customDraft, setCustomDraft] = useState<string>("");
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);

  const rawTemplate = useMemo(() => {
    if (messageMode === "recuperacion") return config.templates.recuperacion;
    if (messageMode === "cobro") return config.templates.cobro;
    return customDraft;
  }, [messageMode, config.templates, customDraft]);

  const activeRenderedMessage = useMemo(() => {
    if (!student) return "";
    return renderTemplate(rawTemplate, student, config);
  }, [rawTemplate, student, config]);

  if (!student) {
    return (
      <EmptyState
        icon={IdCard}
        title="Alumno no encontrado"
        description="Puede que se haya quitado en una importación."
        action={
          <Link href="/alumnos">
            <Button variant="secondary">Volver a Alumnos</Button>
          </Link>
        }
      />
    );
  }

  const sig = getSignals(student, config);
  const seguimientosMes = student.followUps.filter((f) => isSameMonth(f.fecha.slice(0, 10))).length;

  return (
    <div className="space-y-6">
      <Link
        href="/alumnos"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-fg"
      >
        <ArrowLeft size={15} /> Alumnos
      </Link>

      {/* Header */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 bg-gradient-to-r from-accent/[0.06] to-transparent p-6 sm:flex-row sm:items-center">
          <Avatar nombre={student.nombre} apellido={student.apellido} size={64} />
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{student.nombreCompleto}</h1>
            <div className="mt-1 flex items-center gap-2 text-[13px] text-muted">
              <span className="tnum">Socio #{student.idSocio}</span>
              {student.membresia && <span>· {student.membresia}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CuotaBadge estado={sig.estadoCuota} />
            <RiesgoBadge nivel={sig.riesgo} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border px-6 py-4">
          <WhatsappButton
            student={student}
            message={recuperacionMessage(student, config)}
            tipo="recuperacion"
            label="Mensaje de recuperación"
          />
          <WhatsappButton
            student={student}
            message={cobroMessage(student, config)}
            tipo="cobro"
            label="Recordatorio de cuota"
          />
        </div>
      </Card>

      {/* Message Composer & Live Preview Section */}
      <Card className="p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-[#1f8f4e]/20 text-[#22a058]">
              <MessageCircle size={16} />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-fg">Enviar mensaje por WhatsApp</h3>
              <p className="text-[12px] text-muted">
                Previsualización con datos reales de {student.nombre || student.nombreCompleto}
              </p>
            </div>
          </div>

          {/* Mode Selector */}
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-white/[0.02] p-1">
            <button
              type="button"
              onClick={() => setMessageMode("recuperacion")}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                messageMode === "recuperacion"
                  ? "bg-accent/15 text-accent font-semibold"
                  : "text-muted hover:text-fg"
              }`}
            >
              Recuperación
            </button>
            <button
              type="button"
              onClick={() => setMessageMode("cobro")}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                messageMode === "cobro"
                  ? "bg-accent/15 text-accent font-semibold"
                  : "text-muted hover:text-fg"
              }`}
            >
              Cobro
            </button>
            <button
              type="button"
              onClick={() => {
                if (!customDraft) {
                  setCustomDraft(`Hola {{nombre}} 👋\n\n`);
                }
                setMessageMode("custom");
              }}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                messageMode === "custom"
                  ? "bg-accent/15 text-accent font-semibold"
                  : "text-muted hover:text-fg"
              }`}
            >
              Personalizado
            </button>
          </div>
        </div>

        {/* Custom draft editor if custom mode selected */}
        {messageMode === "custom" && (
          <div className="mb-4 space-y-2">
            <Textarea
              ref={composerTextareaRef}
              rows={3}
              placeholder="Escribí tu mensaje usando variables como {{nombre}}..."
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
            />
            <VariableToolbar
              compact
              onInsert={(tag) =>
                insertAtCursor(composerTextareaRef.current, tag, customDraft, (val) =>
                  setCustomDraft(val),
                )
              }
            />
          </div>
        )}

        {/* Live Preview Box */}
        <div className="rounded-xl border border-[#1f8f4e]/30 bg-[#0b3d24]/20 p-4">
          <div className="mb-2 flex items-center justify-between border-b border-[#1f8f4e]/20 pb-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#22a058]">
              <Sparkles size={13} />
              <span>Mensaje personalizado listo para enviar</span>
            </div>
            {student.telefonoRaw && (
              <span className="text-[12px] text-muted">
                Destino: <span className="font-mono text-fg">{student.telefonoRaw}</span>
              </span>
            )}
          </div>

          <p className="whitespace-pre-line text-sm leading-relaxed text-fg">
            {activeRenderedMessage || <span className="italic text-muted">Sin mensaje</span>}
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-[#1f8f4e]/20 pt-3">
            <WhatsappButton
              student={student}
              message={activeRenderedMessage}
              tipo={messageMode === "cobro" ? "cobro" : "recuperacion"}
              label="Abrir WhatsApp y enviar"
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <StatBox
              icon={Clock}
              value={sig.diasSinVenir != null ? `${sig.diasSinVenir}d` : "—"}
              label={sig.diasSinVenirEsProxy ? "Desde vencimiento" : "Sin venir"}
              tone="bg-warning/12 text-warning"
            />
            <StatBox
              icon={Activity}
              value={`${seguimientosMes}`}
              label="Seguimientos este mes"
              tone="bg-accent/12 text-accent"
            />
          </div>

          {/* Datos personales */}
          <Card className="p-5">
            <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
              Datos personales
            </h3>
            <div className="divide-y divide-border/60">
              <DataRow icon={Phone} label="Teléfono" value={student.telefonoRaw ?? "—"} />
              <DataRow icon={Mail} label="Email" value={student.email ?? "—"} />
              <DataRow icon={CalendarClock} label="Vencimiento" value={formatDate(student.fechaFin)} />
              <DataRow icon={CalendarPlus} label="Alta" value={formatDate(student.fechaAlta)} />
              <DataRow
                icon={Clock}
                label="Última visita"
                value={student.ultimaAsistencia ? formatDate(student.ultimaAsistencia) : "Sin datos"}
              />
            </div>
            {student.observacion && (
              <p className="mt-3 rounded-lg bg-white/[0.02] px-3 py-2 text-[13px] text-muted">
                {student.observacion}
              </p>
            )}
          </Card>
        </div>

        {/* Timeline + notas */}
        <Card className="p-5">
          <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-muted">
            Seguimientos y conversaciones
          </h3>

          <div className="mb-5 flex gap-2">
            <Textarea
              rows={2}
              placeholder="Agregar una nota o conversación…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="flex-1"
            />
            <Button
              variant="secondary"
              size="icon"
              disabled={!note.trim()}
              aria-label="Agregar nota manual"
              className="h-auto self-stretch"
              onClick={() => {
                if (!note.trim()) return;
                addFollowUp(
                  student.id,
                  { tipo: "nota", canal: "manual", mensaje: note.trim(), resultado: "contactado" },
                  organization?.id,
                );
                setNote("");
                push("Nota agregada", "success");
              }}
            >
              <Plus size={18} />
            </Button>
          </div>

          {student.followUps.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
              title="Sin seguimientos"
              description="Cuando le escribas por WhatsApp o agregues una nota, va a quedar registrado acá."
              className="border-0 py-10"
            />
          ) : (
            <div>
              {student.followUps.map((fu) => (
                <TimelineItem
                  key={fu.id}
                  fu={fu}
                  onResolve={(resultado) => {
                    setFollowUpResultado(student.id, fu.id, resultado, organization?.id);
                    push(resultado === "recuperado" ? "¡Marcado como recuperado!" : "Actualizado", "success");
                  }}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}