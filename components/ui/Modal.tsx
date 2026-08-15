"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: number;
  size?: "sm" | "md" | "lg" | "xl" | "full" | string;
  bodyClassName?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth,
  size = "md",
  bodyClassName = "p-5",
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const resolvedMaxWidth = maxWidth ?? (
    size === "sm" ? 420 :
    size === "md" ? 520 :
    size === "lg" ? 640 :
    size === "xl" ? 780 :
    size === "full" ? 960 : 560
  );

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title || "Ventana modal"}
            className="relative w-full glass rounded-[18px] border border-border-strong shadow-pop max-h-[90vh] overflow-y-auto"
            style={{ maxWidth: resolvedMaxWidth }}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {title ? (
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 className="text-[15px] font-semibold">{title}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cerrar modal"
                  className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-fg"
                >
                  <X size={16} />
                </button>
              </div>
            ) : null}
            <div className={bodyClassName}>{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

