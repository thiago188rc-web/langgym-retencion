import type { Config, Student } from "./types";

/** Replace template placeholders with student/gym values. */
export function renderTemplate(template: string, student: Student, config: Config): string {
  return template
    .replace(/\{nombre\}/gi, student.nombre || student.nombreCompleto || "")
    .replace(/\{apellido\}/gi, student.apellido || "")
    .replace(/\{nombreCompleto\}/gi, student.nombreCompleto || "")
    .replace(/\{gym\}/gi, config.gymName)
    .replace(/\{membresia\}/gi, student.membresia || "");
}

/** Build a wa.me deep link that opens WhatsApp with the message pre-filled. */
export function whatsappLink(student: Student, message: string): string | null {
  if (!student.telefono) return null;
  return `https://wa.me/${student.telefono}?text=${encodeURIComponent(message)}`;
}

export function recuperacionMessage(student: Student, config: Config): string {
  return renderTemplate(config.templates.recuperacion, student, config);
}

export function cobroMessage(student: Student, config: Config): string {
  return renderTemplate(config.templates.cobro, student, config);
}
