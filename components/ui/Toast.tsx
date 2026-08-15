"use client";

import { create } from "zustand";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Info, TriangleAlert } from "lucide-react";
import { uid } from "@/lib/utils";

type ToastTone = "success" | "info" | "warning" | "danger";
interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, tone?: ToastTone) => void;
  remove: (id: string) => void;
}

export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, tone = "success") => {
    const id = uid("toast");
    set({ toasts: [...get().toasts, { id, message, tone }] });
    setTimeout(() => get().remove(id), 3200);
  },
  remove: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

const icons = {
  success: Check,
  info: Info,
  warning: TriangleAlert,
  danger: TriangleAlert,
};
const toneColor = {
  success: "text-success",
  info: "text-info",
  warning: "text-warning",
  danger: "text-danger",
};

export function ToastViewport() {
  const toasts = useToast((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = icons[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto flex items-center gap-2.5 rounded-full glass border border-border-strong px-4 py-2.5 text-sm shadow-pop"
            >
              <Icon size={16} className={toneColor[t.tone]} />
              <span className="text-fg">{t.message}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
