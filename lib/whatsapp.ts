import type { Config, Student } from "./types";

export interface TemplateVariable {
  key: string;
  tag: string;
  label: string;
  description: string;
  example: string;
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  {
    key: "nombre",
    tag: "{{nombre}}",
    label: "Nombre",
    description: "Primer nombre del alumno",
    example: "Andrés",
  },
  {
    key: "apellido",
    tag: "{{apellido}}",
    label: "Apellido",
    description: "Apellido del alumno",
    example: "Pérez",
  },
  {
    key: "nombre_completo",
    tag: "{{nombre_completo}}",
    label: "Nombre completo",
    description: "Nombre y apellido combinados",
    example: "Andrés Pérez",
  },
  {
    key: "gym",
    tag: "{{gym}}",
    label: "Gimnasio",
    description: "Nombre del gimnasio",
    example: "Lang Gym",
  },
  {
    key: "membresia",
    tag: "{{membresia}}",
    label: "Membresía",
    description: "Plan o tipo de membresía",
    example: "Pase libre",
  },
];

/**
 * Safely resolves first name, last name, and full name from a student record,
 * preventing 'undefined', 'null' or empty strings.
 */
export function getStudentNames(student: Partial<Student>): {
  nombre: string;
  apellido: string;
  nombreCompleto: string;
} {
  const nombreRaw = (student.nombre ?? "").trim();
  const apellidoRaw = (student.apellido ?? "").trim();
  const nombreCompletoRaw = (student.nombreCompleto ?? "").trim();

  let nombre = nombreRaw;
  let apellido = apellidoRaw;
  let nombreCompleto = nombreCompletoRaw;

  // If only nombreCompleto was provided, split into nombre + apellido
  if (!nombre && !apellido && nombreCompleto) {
    const tokens = nombreCompleto.split(" ").filter(Boolean);
    nombre = tokens[0] || "";
    apellido = tokens.slice(1).join(" ") || "";
  }

  // If nombreCompleto is missing, build it from nombre + apellido
  if (!nombreCompleto) {
    nombreCompleto = [nombre, apellido].filter(Boolean).join(" ");
  }

  // If nombre is still empty, fallback to whatever identifier is available
  if (!nombre && nombreCompleto) {
    nombre = nombreCompleto;
  }

  return { nombre, apellido, nombreCompleto };
}

/**
 * Replace template placeholders with student/gym values.
 * Supports:
 * - {{nombre}} / {nombre}
 * - {{apellido}} / {apellido}
 * - {{nombre_completo}} / {{nombreCompleto}} / {nombre_completo} / {nombreCompleto}
 * - {{gym}} / {gym}
 * - {{membresia}} / {membresia}
 *
 * Case-insensitive, tolerates whitespace inside brackets (e.g. {{ nombre }}),
 * and cleans up dangling whitespace when an optional variable is missing.
 */
export function renderTemplate(template: string, student: Student, config: Config): string {
  if (!template) return "";

  const { nombre, apellido, nombreCompleto } = getStudentNames(student);
  const gymName = (config?.gymName ?? "").trim();
  const membresia = (student?.membresia ?? "").trim();

  let rendered = template
    // Replace full name variations
    .replace(
      /\{\{\s*(?:nombre_completo|nombreCompleto)\s*\}\}|\{\s*(?:nombre_completo|nombreCompleto)\s*\}/gi,
      nombreCompleto,
    )
    // Replace first name
    .replace(/\{\{\s*nombre\s*\}\}|\{\s*nombre\s*\}/gi, nombre)
    // Replace last name
    .replace(/\{\{\s*apellido\s*\}\}|\{\s*apellido\s*\}/gi, apellido)
    // Replace gym name
    .replace(/\{\{\s*gym\s*\}\}|\{\s*gym\s*\}/gi, gymName)
    // Replace membership
    .replace(/\{\{\s*membresia\s*\}\}|\{\s*membresia\s*\}/gi, membresia);

  // Clean up any double spaces that might occur if a missing field (e.g. apellido) left extra whitespace,
  // and fix orphaned spaces before punctuation like "Hola Juan ," -> "Hola Juan,"
  rendered = rendered
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\s+([,.:;!?])/g, "$1")
        .trimEnd(),
    )
    .join("\n");

  return rendered;
}

/** Build a wa.me deep link that opens WhatsApp with the message pre-filled. */
export function whatsappLink(student: Student, message: string): string | null {
  if (!student?.telefono) return null;
  return `https://wa.me/${student.telefono}?text=${encodeURIComponent(message)}`;
}

export function recuperacionMessage(student: Student, config: Config): string {
  return renderTemplate(config.templates.recuperacion, student, config);
}

export function cobroMessage(student: Student, config: Config): string {
  return renderTemplate(config.templates.cobro, student, config);
}
