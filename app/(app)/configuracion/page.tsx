"use client";

import { useRef, useState } from "react";
import {
  Building2,
  ImageUp,
  MessageSquare,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Eye,
  UserCheck,
  UserX,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Field } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { VariableToolbar, insertAtCursor } from "@/components/ui/VariableToolbar";
import { renderTemplate } from "@/lib/whatsapp";
import { DEFAULT_CONFIG } from "@/lib/config";
import type { Student } from "@/lib/types";

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Building2;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-accent/12 text-accent">
          <Icon size={19} />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <p className="text-[13px] text-muted">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

const SAMPLE_STUDENTS: { id: string; label: string; student: Student }[] = [
  {
    id: "with-last-name",
    label: "Andrés Pérez (con apellido)",
    student: {
      id: "demo-1",
      idSocio: "1001",
      nombre: "Andrés",
      apellido: "Pérez",
      nombreCompleto: "Andrés Pérez",
      telefono: "5492235670245",
      telefonoRaw: "2235670245",
      email: "andres@ejemplo.com",
      habilitado: true,
      idMembresia: "1",
      membresia: "Pase libre",
      fechaFin: "2026-08-20",
      fechaAlta: "2026-01-10",
      ultimaAsistencia: "2026-08-01",
      observacion: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      snapshots: [],
      followUps: [],
    },
  },
  {
    id: "no-last-name",
    label: "Juan (sin apellido)",
    student: {
      id: "demo-2",
      idSocio: "1002",
      nombre: "Juan",
      apellido: "",
      nombreCompleto: "Juan",
      telefono: "5492235851985",
      telefonoRaw: "2235851985",
      email: null,
      habilitado: true,
      idMembresia: "2",
      membresia: "Musculación",
      fechaFin: "2026-08-14",
      fechaAlta: "2026-03-15",
      ultimaAsistencia: null,
      observacion: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      snapshots: [],
      followUps: [],
    },
  },
];

export default function ConfiguracionPage() {
  const config = useStore((s) => s.config);
  const updateConfig = useStore((s) => s.updateConfig);
  const reset = useStore((s) => s.reset);
  const push = useToast((s) => s.push);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [selectedSample, setSelectedSample] = useState<string>("with-last-name");

  const recTextareaRef = useRef<HTMLTextAreaElement>(null);
  const cobTextareaRef = useRef<HTMLTextAreaElement>(null);

  const currentSample =
    SAMPLE_STUDENTS.find((s) => s.id === selectedSample)?.student ?? SAMPLE_STUDENTS[0].student;

  function onLogo(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      updateConfig({ logoDataUrl: reader.result as string });
      push("Logo actualizado", "success");
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Marca */}
      <Section icon={Building2} title="Marca del gimnasio" description="Nombre y logo que se muestran en el sistema">
        <div className="flex items-center gap-5">
          <button
            onClick={() => fileRef.current?.click()}
            className="group relative flex size-16 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-accent/50"
          >
            {config.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.logoDataUrl} alt="logo" className="size-16 object-cover" />
            ) : (
              <Avatar nombre={config.gymName} apellido="" size={64} />
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <ImageUp size={20} className="text-white" />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])}
          />
          <div className="flex-1 space-y-3">
            <Field label="Nombre del gimnasio">
              <Input value={config.gymName} onChange={(e) => updateConfig({ gymName: e.target.value })} />
            </Field>
            <Field label="Responsable">
              <Input value={config.ownerName} onChange={(e) => updateConfig({ ownerName: e.target.value })} />
            </Field>
          </div>
        </div>
      </Section>

      {/* Mensajes */}
      <Section
        icon={MessageSquare}
        title="Mensajes de WhatsApp"
        description="Personalizá los mensajes automáticos usando variables dinámicas"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-white/[0.02] p-3">
          <div className="flex items-center gap-2 text-[13px] text-muted">
            <Eye size={15} className="text-accent" />
            <span>Previsualizar con datos de:</span>
          </div>
          <div className="flex gap-1.5">
            {SAMPLE_STUDENTS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSample(s.id)}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  selectedSample === s.id
                    ? "bg-accent/15 text-accent border border-accent/30"
                    : "bg-card border border-border text-muted hover:text-fg"
                }`}
              >
                {s.id === "with-last-name" ? <UserCheck size={13} /> : <UserX size={13} />}
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {/* Mensaje de recuperación */}
          <div className="space-y-2">
            <Field
              label="Mensaje de recuperación"
              hint="Se envía a alumnos ausentes para incentivarlos a volver"
            >
              <Textarea
                ref={recTextareaRef}
                rows={4}
                value={config.templates.recuperacion}
                onChange={(e) =>
                  updateConfig({ templates: { ...config.templates, recuperacion: e.target.value } })
                }
              />
            </Field>

            <VariableToolbar
              onInsert={(tag) =>
                insertAtCursor(
                  recTextareaRef.current,
                  tag,
                  config.templates.recuperacion,
                  (val) => updateConfig({ templates: { ...config.templates, recuperacion: val } }),
                )
              }
            />

            <div className="mt-2 rounded-xl border border-[#1f8f4e]/30 bg-[#0b3d24]/25 p-3.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#22a058]">
                <span>Previsualización WhatsApp</span>
              </div>
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-fg/90">
                {renderTemplate(config.templates.recuperacion, currentSample, config)}
              </p>
            </div>
          </div>

          {/* Mensaje de cobro */}
          <div className="space-y-2">
            <Field
              label="Mensaje de cobro / cuota"
              hint="Se envía a alumnos con cuota por vencer o vencida"
            >
              <Textarea
                ref={cobTextareaRef}
                rows={4}
                value={config.templates.cobro}
                onChange={(e) =>
                  updateConfig({ templates: { ...config.templates, cobro: e.target.value } })
                }
              />
            </Field>

            <VariableToolbar
              onInsert={(tag) =>
                insertAtCursor(
                  cobTextareaRef.current,
                  tag,
                  config.templates.cobro,
                  (val) => updateConfig({ templates: { ...config.templates, cobro: val } }),
                )
              }
            />

            <div className="mt-2 rounded-xl border border-[#1f8f4e]/30 bg-[#0b3d24]/25 p-3.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#22a058]">
                <span>Previsualización WhatsApp</span>
              </div>
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-fg/90">
                {renderTemplate(config.templates.cobro, currentSample, config)}
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* Reglas */}
      <Section
        icon={SlidersHorizontal}
        title="Reglas de abandono y cobros"
        description="Definí los días para clasificar ausencias"
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Nivel 1 (días)">
            <Input
              type="number"
              value={config.diasRiesgo.nivel1}
              onChange={(e) =>
                updateConfig({ diasRiesgo: { ...config.diasRiesgo, nivel1: Number(e.target.value) } })
              }
            />
          </Field>
          <Field label="Nivel 2 (días)">
            <Input
              type="number"
              value={config.diasRiesgo.nivel2}
              onChange={(e) =>
                updateConfig({ diasRiesgo: { ...config.diasRiesgo, nivel2: Number(e.target.value) } })
              }
            />
          </Field>
          <Field label="Nivel 3 (días)">
            <Input
              type="number"
              value={config.diasRiesgo.nivel3}
              onChange={(e) =>
                updateConfig({ diasRiesgo: { ...config.diasRiesgo, nivel3: Number(e.target.value) } })
              }
            />
          </Field>
          <Field label="Por vencer (días)">
            <Input
              type="number"
              value={config.porVencerDias}
              onChange={(e) => updateConfig({ porVencerDias: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <Field label="Código de país" hint="Argentina = 54">
            <Input
              value={config.countryCode}
              onChange={(e) => updateConfig({ countryCode: e.target.value.replace(/\D/g, "") })}
            />
          </Field>
          <Field label="Prefijo móvil" hint="Argentina = 9">
            <Input
              value={config.mobilePrefix}
              onChange={(e) => updateConfig({ mobilePrefix: e.target.value.replace(/\D/g, "") })}
            />
          </Field>
        </div>
        <div className="mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              updateConfig({
                diasRiesgo: DEFAULT_CONFIG.diasRiesgo,
                porVencerDias: DEFAULT_CONFIG.porVencerDias,
                templates: DEFAULT_CONFIG.templates,
              });
              push("Valores restaurados", "info");
            }}
          >
            <RotateCcw size={14} /> Restaurar valores por defecto
          </Button>
        </div>
      </Section>

      {/* Datos */}
      <Card className="border-danger/20 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-[15px] font-semibold text-fg">Borrar todos los datos</h3>
            <p className="text-[13px] text-muted">
              Elimina los alumnos importados de este dispositivo. No afecta a tu sistema SIGA.
            </p>
          </div>
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            <Trash2 size={15} /> Borrar
          </Button>
        </div>
      </Card>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="¿Borrar todos los datos?">
        <p className="text-sm text-muted">
          Se eliminarán todos los alumnos y seguimientos guardados en este navegador. Tu configuración
          y tu sistema SIGA no se modifican. Esta acción no se puede deshacer.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmReset(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              reset();
              setConfirmReset(false);
              push("Datos eliminados", "info");
            }}
          >
            Sí, borrar todo
          </Button>
        </div>
      </Modal>
    </div>
  );
}