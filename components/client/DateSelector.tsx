"use client";

import { useMemo } from "react";
import { getArgentinaTodayISO, getDayOfWeekFromISO } from "@/lib/dates";

const DAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

interface DayItem {
  iso: string;
  dayNumber: string;
  dayName: string;
  label: string;
  isToday: boolean;
}

export function DateSelector({
  selectedDate,
  onSelectDate,
}: {
  selectedDate: string;
  onSelectDate: (iso: string) => void;
}) {
  const daysList: DayItem[] = useMemo(() => {
    const todayISO = getArgentinaTodayISO();
    const [y, m, d] = todayISO.split("-").map(Number);
    const list: DayItem[] = [];

    for (let i = 0; i < 14; i++) {
      const dt = new Date(Date.UTC(y, m - 1, d + i, 12, 0, 0));
      const year = dt.getUTCFullYear();
      const month = String(dt.getUTCMonth() + 1).padStart(2, "0");
      const day = String(dt.getUTCDate()).padStart(2, "0");
      const iso = `${year}-${month}-${day}`;
      const dow = dt.getUTCDay();

      let label = DAYS_SHORT[dow];
      if (i === 0) label = "HOY";
      else if (i === 1) label = "MAÑANA";

      list.push({
        iso,
        dayNumber: String(dt.getUTCDate()),
        dayName: DAYS_SHORT[dow],
        label,
        isToday: i === 0,
      });
    }

    return list;
  }, []);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between pb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-faint">
          Elegí el día
        </span>
        <span className="text-[11px] text-muted">Próximos 14 días</span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
        {daysList.map((item) => {
          const isSelected = item.iso === selectedDate;

          return (
            <button
              key={item.iso}
              type="button"
              onClick={() => onSelectDate(item.iso)}
              className={`flex min-w-[72px] flex-col items-center justify-center rounded-2xl border px-3 py-2.5 transition-all select-none ${
                isSelected
                  ? "border-accent bg-accent/15 text-accent shadow-sm scale-[1.02]"
                  : "border-border bg-card/60 text-muted hover:border-border-strong hover:bg-card hover:text-fg"
              }`}
            >
              <span
                className={`text-[11px] font-semibold tracking-wide uppercase ${
                  isSelected ? "text-accent" : item.isToday ? "text-accent/80" : "text-faint"
                }`}
              >
                {item.label}
              </span>
              <span
                className={`text-xl font-bold mt-0.5 ${
                  isSelected ? "text-fg" : "text-fg/90"
                }`}
              >
                {item.dayNumber}
              </span>
              <span className="text-[10px] text-faint mt-0.5">
                {item.dayName}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
