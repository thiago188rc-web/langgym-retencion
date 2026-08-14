"use client";

import { MessageCircle, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { whatsappLink } from "@/lib/whatsapp";
import type { FollowUpTipo, Student } from "@/lib/types";

export function WhatsappButton({
  student,
  message,
  tipo,
  size = "md",
  label = "WhatsApp",
}: {
  student: Student;
  message: string;
  tipo: FollowUpTipo;
  size?: "sm" | "md";
  label?: string;
}) {
  const addFollowUp = useStore((s) => s.addFollowUp);
  const push = useToast((s) => s.push);
  const link = whatsappLink(student, message);

  if (!link) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-white/[0.02] px-3 font-medium text-faint",
          size === "sm" ? "h-8 text-[13px]" : "h-9 text-sm",
        )}
        title="Sin teléfono válido"
      >
        <PhoneOff size={15} />
        Sin teléfono
      </span>
    );
  }

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        addFollowUp(student.id, { tipo, canal: "whatsapp", mensaje: message, resultado: "contactado" });
        const name = student.nombre || student.nombreCompleto || "el alumno";
        push(`Mensaje preparado para ${name}`, "success");
      }}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-[10px] font-medium text-white",
        "bg-[#1f8f4e] transition-all duration-150 hover:bg-[#22a058] active:scale-[0.98]",
        "shadow-[0_2px_10px_rgba(34,160,88,0.25)] hover:shadow-[0_4px_16px_rgba(34,160,88,0.35)]",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-3.5 text-sm",
      )}
    >
      <MessageCircle size={size === "sm" ? 15 : 16} className="transition-transform group-hover:scale-110" />
      {label}
    </a>
  );
}
