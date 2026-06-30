"use client";

import { useRef, useState } from "react";
import { Building2, ImageUp, MessageSquare, RotateCcw, SlidersHorizontal, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Field } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { DEFAULT_CONFIG } from "@/lib/config";

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

function previewMessage(template: string, gym: string) {
  return template
    .replace(/\{nombre\}/gi, "Juan")
    .replace(/\{apellido\}/gi, "Pérez")
    .replace(/\{nombreCompleto\}/gi, "Juan Pérez")
    .replace(/\{gym\}/gi, gym)
    .replace(/\{membresia\}/gi, "Pase libre");
}

export default function ConfiguracionPage() {
  const config = useStore((s) => s.config);
  const updateConfig = useStore((s) => s.updateConfig);
  const reset = useStore((s) => s.reset);
  const push = useToast((s) => s.push);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);

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
        description="Usá {nombre}, {gym} y {membresia} como variables"
      >
        <div className="space-y-5">
          <div>
            <Field label="Mensaje de recuperación">
              <Textarea
                rows={4}
                value={config.templates.recuperacion}
                onChange={(e) =>
                  updateConfig({ templates: { ...config.templates, recuperacion: e.target.value } })
                }
              />
            </Field>
            <p className="mt-2 whitespace-pre-line rounded-lg border border-border bg-[#0b3d24]/30 px-3 py-2 text-[13px] text-muted">
              {previewMessage(config.templates.recuperacion, config.gymName)}
            </p>
          </div>
          <div>
            <Field label="Mensaje de cobro">
              <Textarea
                rows={4}
                value={config.templates.cobro}
                onChange={(e) => updateConfig({ templates: { ...config.templates, cobro: e.target.value } })}
              />
            </Field>
            <p className="mt-2 whitespace-pre-line rounded-lg border border-border bg-[#0b3d24]/30 px-3 py-2 text-[13px] text-muted">
              {previewMessage(config.templates.cobro, config.gymName)}
            </p>
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
            <Input value={config.countryCode} onChange={(e) => updateConfig({ countryCode: e.target.value.replace(/\D/g, "") })} />
          </Field>
          <Field label="Prefijo móvil" hint="Argentina = 9">
            <Input value={config.mobilePrefix} onChange={(e) => updateConfig({ mobilePrefix: e.target.value.replace(/\D/g, "") })} />
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