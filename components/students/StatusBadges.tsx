import { Badge, type Tone } from "@/components/ui/Badge";
import type { CuotaEstado, RiesgoNivel } from "@/lib/types";

const CUOTA_META: Record<CuotaEstado, { label: string; tone: Tone }> = {
  vigente: { label: "Al día", tone: "success" },
  por_vencer: { label: "Por vencer", tone: "warning" },
  vencida: { label: "Vencida", tone: "danger" },
  sin_membresia: { label: "Sin membresía", tone: "neutral" },
};

const RIESGO_META: Record<RiesgoNivel, { label: string; tone: Tone }> = {
  ok: { label: "Activo", tone: "success" },
  bajo: { label: "Riesgo bajo", tone: "info" },
  medio: { label: "Riesgo medio", tone: "warning" },
  alto: { label: "Riesgo alto", tone: "danger" },
  critico: { label: "Crítico", tone: "danger" },
};

export function CuotaBadge({ estado }: { estado: CuotaEstado }) {
  const m = CUOTA_META[estado];
  return (
    <Badge tone={m.tone} dot>
      {m.label}
    </Badge>
  );
}

export function RiesgoBadge({ nivel }: { nivel: RiesgoNivel }) {
  const m = RIESGO_META[nivel];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export { CUOTA_META, RIESGO_META };
