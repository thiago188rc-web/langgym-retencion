"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { FileSpreadsheet, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

export function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center gap-5 rounded-[20px] border-2 border-dashed px-6 py-20 text-center transition-all duration-200",
        dragging
          ? "border-accent bg-accent/[0.06] glow-accent"
          : "border-border-strong bg-card/40 hover:border-accent/50 hover:bg-card/70",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <motion.div
        animate={{ y: dragging ? -4 : 0, scale: dragging ? 1.05 : 1 }}
        className="flex size-16 items-center justify-center rounded-2xl bg-accent/12 text-accent"
      >
        <UploadCloud size={30} strokeWidth={1.75} />
      </motion.div>
      <div className="space-y-1.5">
        <p className="text-[17px] font-semibold text-fg">
          {dragging ? "Soltá el archivo acá" : "Arrastrá tu Excel de SIGA"}
        </p>
        <p className="mx-auto max-w-md text-sm text-muted">
          O hacé clic para seleccionarlo. Detectamos las columnas automáticamente, aunque cambien de
          orden entre exportaciones.
        </p>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1.5 text-[12px] text-muted">
        <FileSpreadsheet size={14} className="text-success" />
        Formatos: .xlsx · .xls · .csv
      </div>
    </motion.div>
  );
}