export type CuotaEstado = "vigente" | "por_vencer" | "vencida" | "sin_membresia";

export type RiesgoNivel = "ok" | "bajo" | "medio" | "alto" | "critico";

export type FollowUpTipo = "recuperacion" | "cobro" | "nota";
export type FollowUpResultado =
  | "pendiente"
  | "contactado"
  | "recuperado"
  | "sin_respuesta";

export interface FollowUp {
  id: string;
  fecha: string; // ISO datetime
  tipo: FollowUpTipo;
  canal: "whatsapp" | "manual";
  mensaje?: string;
  resultado: FollowUpResultado;
}

/** A frozen view of the student at the moment of an import — powers history. */
export interface Snapshot {
  fecha: string; // ISO datetime of the import
  fechaFin: string | null;
  ultimaAsistencia: string | null;
  membresia: string | null;
  habilitado: boolean;
}

export interface Student {
  id: string; // internal uuid
  idSocio: string; // external SIGA id (stable across imports)
  nombre: string;
  apellido: string;
  nombreCompleto: string;
  telefono: string | null; // digits only, normalized
  telefonoRaw: string | null;
  email: string | null;
  habilitado: boolean;
  idMembresia: string | null;
  membresia: string | null;
  fechaFin: string | null; // cuota vencimiento (ISO)
  fechaAlta: string | null; // ISO
  ultimaAsistencia: string | null; // ISO, if the source provides it
  observacion: string | null;
  createdAt: string;
  updatedAt: string;
  snapshots: Snapshot[];
  followUps: FollowUp[];
}

export interface ImportRecord {
  id: string;
  fecha: string; // ISO datetime
  archivo: string;
  nuevos: number;
  actualizados: number;
  errores: number;
  total: number;
}

export interface WhatsappTemplates {
  recuperacion: string;
  cobro: string;
}

export interface Config {
  gymName: string;
  ownerName: string;
  logoDataUrl: string | null;
  countryCode: string; // "54"
  mobilePrefix: string; // "9" for AR mobiles, "" to disable
  diasRiesgo: { nivel1: number; nivel2: number; nivel3: number }; // 7 / 15 / 30
  porVencerDias: number; // window for "por vencer"
  templates: WhatsappTemplates;
}

/** Canonical field names the importer maps raw Excel headers to. */
export type CanonicalField =
  | "idSocio"
  | "nombre"
  | "habilitado"
  | "idMembresia"
  | "membresia"
  | "fechaFin"
  | "fechaAlta"
  | "ultimaAsistencia"
  | "email"
  | "telefono"
  | "celular"
  | "observacion";

export interface ColumnMapping {
  /** header text (as found) -> canonical field, or null if unmapped */
  byHeader: Record<string, CanonicalField | null>;
  /** canonical field -> source header */
  byField: Partial<Record<CanonicalField, string>>;
  unmapped: string[];
  missingRequired: CanonicalField[];
}

export interface ImportError {
  fila: number;
  motivo: string;
  datos: Record<string, unknown>;
}

export interface ImportResult {
  mapping: ColumnMapping;
  nuevos: number;
  actualizados: number;
  errores: ImportError[];
  totalFilas: number;
  parsedStudents: ParsedStudent[];
}

/** A student parsed from one Excel row, before reconciliation with the store. */
export interface ParsedStudent {
  idSocio: string;
  nombre: string;
  apellido: string;
  nombreCompleto: string;
  telefono: string | null;
  telefonoRaw: string | null;
  email: string | null;
  habilitado: boolean;
  idMembresia: string | null;
  membresia: string | null;
  fechaFin: string | null;
  fechaAlta: string | null;
  ultimaAsistencia: string | null;
  observacion: string | null;
}
