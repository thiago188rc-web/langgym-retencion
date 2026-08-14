"use client";

import React, { useState } from "react";
import { Sparkles, Plus, Check } from "lucide-react";
import { TEMPLATE_VARIABLES } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

/**
 * Inserts a tag at the current cursor position in a textarea element
 * or appends it if the element is not focused.
 */
export function insertAtCursor(
  el: HTMLTextAreaElement | null,
  tag: string,
  currentValue: string,
  onUpdate: (newValue: string) => void,
) {
  if (!el) {
    onUpdate(currentValue ? `${currentValue} ${tag}` : tag);
    return;
  }
  const start = typeof el.selectionStart === "number" ? el.selectionStart : currentValue.length;
  const end = typeof el.selectionEnd === "number" ? el.selectionEnd : currentValue.length;
  const before = currentValue.substring(0, start);
  const after = currentValue.substring(end);
  const newValue = before + tag + after;
  onUpdate(newValue);

  // Preserve focus and position cursor immediately after inserted tag
  requestAnimationFrame(() => {
    el.focus();
    const newPos = start + tag.length;
    el.setSelectionRange(newPos, newPos);
  });
}

export function VariableToolbar({
  onInsert,
  compact = false,
  className,
}: {
  onInsert: (tag: string) => void;
  compact?: boolean;
  className?: string;
}) {
  const [justInserted, setJustInserted] = useState<string | null>(null);

  const handleInsert = (tag: string) => {
    onInsert(tag);
    setJustInserted(tag);
    setTimeout(() => setJustInserted(null), 1000);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 py-1", className)}>
      <span className="mr-1 inline-flex items-center gap-1 text-[12px] font-medium text-muted">
        <Sparkles size={13} className="text-accent" />
        Insertar variable:
      </span>
      {TEMPLATE_VARIABLES.map((v) => {
        const isSelected = justInserted === v.tag;
        return (
          <button
            key={v.key}
            type="button"
            onClick={() => handleInsert(v.tag)}
            title={`${v.label} (${v.description}) - Ej: "${v.example}"`}
            className={cn(
              "group inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] font-medium transition-all duration-150 active:scale-95",
              isSelected
                ? "border-accent/40 bg-accent/15 text-accent"
                : "bg-white/[0.03] text-fg hover:border-accent/30 hover:bg-accent/10 hover:text-accent",
              compact && "px-1.5 py-0.5 text-[11px]",
            )}
          >
            {isSelected ? (
              <Check size={12} className="text-accent animate-in fade-in" />
            ) : (
              <Plus size={12} className="text-faint group-hover:text-accent" />
            )}
            <span>{v.label}</span>
            <code className="rounded bg-black/20 px-1 py-0.2 font-mono text-[10px] text-faint group-hover:text-accent/80">
              {v.tag}
            </code>
          </button>
        );
      })}
    </div>
  );
}
