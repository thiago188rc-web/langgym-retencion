"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Dumbbell,
  LogOut,
  Users,
  Phone,
  Clock,
  RefreshCw,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { isProfesorRole, isKnownRole, INCOMPLETE_PROFILE_ROUTE } from "@/lib/auth/roleRouting";
import {
  getProfessorClassRoster,
  getProfessorDayRoster,
  markAttendance,
  type ClassRosterGroup,
  type DayClass,
  type AttendanceStatus,
} from "@/lib/services/professorService";
import { formatClassTime, toLocalISO, todayISO, parseLocalISO, humanDayLabel } from "@/lib/dates";
import { Button } from "@/components/ui/Button";
import { useToast, ToastViewport } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

const DAYS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function AttendanceButtons({
  status,
  saving,
  onMark,
}: {
  status: AttendanceStatus;
  saving: boolean;
  onMark: (next: "attended" | "no_show" | "confirmed") => void;
}) {
  const isPresent = status === "attended";
  const isAbsent = status === "no_show";

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        disabled={saving}
        aria-pressed={isPresent}
        onClick={() => onMark(isPresent ? "confirmed" : "attended")}
        title={isPresent ? "Desmarcar presente" : "Marcar presente"}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-[10px] border px-2.5 text-[12px] font-semibold transition-all active:scale-[0.97]",
          saving && "opacity-50 pointer-events-none",
          isPresent
            ? "border-transparent bg-[#1f8f4e] text-white shadow-[0_2px_10px_rgba(34,160,88,0.25)]"
            : "border-border bg-card text-muted hover:border-success/40 hover:text-success",
        )}
      >
        <Check size={14} />
        Presente
      </button>
      <button
        type="button"
        disabled={saving}
        aria-pressed={isAbsent}
        onClick={() => onMark(isAbsent ? "confirmed" : "no_show")}
        title={isAbsent ? "Desmarcar ausente" : "Marcar ausente"}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-[10px] border px-2.5 text-[12px] font-semibold transition-all active:scale-[0.97]",
          saving && "opacity-50 pointer-events-none",
          isAbsent
            ? "border-transparent bg-danger text-white"
            : "border-border bg-card text-muted hover:border-danger/40 hover:text-danger",
        )}
      >
        <X size={14} />
        Ausente
      </button>
    </div>
  );
}

function DayClassCard({
  cls,
  dateISO,
  savingKey,
  onMark,
}: {
  cls: DayClass;
  dateISO: string;
  savingKey: string | null;
  onMark: (cls: DayClass, userId: string, next: "attended" | "no_show" | "confirmed") => void;
}) {
  const presentes = cls.attendees.filter((a) => a.status === "attended").length;
  const ausentes = cls.attendees.filter((a) => a.status === "no_show").length;
  const sinMarcar = cls.attendees.length - presentes - ausentes;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border"
        style={{ backgroundColor: `${cls.classColor || "#22a058"}14` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: cls.classColor || "#22a058" }}
          >
            <Dumbbell size={16} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-fg truncate">{cls.className}</div>
            <div className="flex items-center gap-1.5 text-[12px] text-muted">
              <Clock size={12} />
              {formatClassTime(cls.startTime)}
              {cls.endTime ? ` - ${formatClassTime(cls.endTime)}` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[12px] font-semibold shrink-0">
          <span className="rounded-full bg-success/15 px-2.5 py-1 text-success">{presentes} presentes</span>
          {ausentes > 0 && (
            <span className="rounded-full bg-danger/15 px-2.5 py-1 text-danger">{ausentes} ausentes</span>
          )}
          {sinMarcar > 0 && (
            <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-muted">{sinMarcar} sin marcar</span>
          )}
        </div>
      </div>

      {cls.attendees.length === 0 ? (
        <div className="px-5 py-6 text-center text-[13px] text-faint">Nadie anotado en este horario.</div>
      ) : (
        <ul className="divide-y divide-border/60">
          {cls.attendees.map((a) => {
            const key = `${cls.scheduleId}:${a.userId}`;
            const cancelled = a.status === "cancelled";
            return (
              <li key={key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className={cn("font-medium truncate", cancelled ? "text-faint line-through" : "text-fg")}>
                    {a.name}
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-muted">
                    {a.phone ? (
                      <span className="flex items-center gap-1">
                        <Phone size={11} />
                        {a.phone}
                      </span>
                    ) : (
                      <span className="text-faint">Sin teléfono</span>
                    )}
                    {cancelled && <span className="text-warning">· canceló este día</span>}
                  </div>
                </div>
                <AttendanceButtons
                  status={a.status}
                  saving={savingKey === key}
                  onMark={(next) => onMark(cls, a.userId, next)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function WeekClassCard({ group }: { group: ClassRosterGroup }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div
        className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border"
        style={{ backgroundColor: `${group.classColor || "#22a058"}14` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: group.classColor || "#22a058" }}
          >
            <Dumbbell size={16} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-fg truncate">{group.className}</div>
            <div className="flex items-center gap-1.5 text-[12px] text-muted">
              <Clock size={12} />
              {DAYS_ES[group.dayOfWeek]} · {formatClassTime(group.startTime)}
              {group.endTime ? ` - ${formatClassTime(group.endTime)}` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[12px] font-semibold text-muted shrink-0">
          <Users size={13} />
          {group.roster.length}
          {group.capacity ? ` / ${group.capacity}` : ""}
        </div>
      </div>

      {group.roster.length === 0 ? (
        <div className="px-5 py-6 text-center text-[13px] text-faint">Nadie anotado todavía.</div>
      ) : (
        <ul className="divide-y divide-border/60">
          {group.roster.map((entry) => (
            <li key={entry.enrollmentId} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <span className="font-medium text-fg truncate">{entry.name}</span>
              <div className="flex items-center gap-3 shrink-0">
                {entry.phone && (
                  <span className="hidden sm:flex items-center gap-1 text-[12px] text-muted">
                    <Phone size={12} />
                    {entry.phone}
                  </span>
                )}
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    entry.status === "pending" ? "bg-warning/15 text-warning" : "bg-success/15 text-success",
                  )}
                >
                  {entry.status === "pending" ? "Pendiente" : "Activo"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ActividadesPage() {
  const { user, profile, organization, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [tab, setTab] = useState<"dia" | "semana">("dia");
  const [dateISO, setDateISO] = useState(() => todayISO());

  const [dayClasses, setDayClasses] = useState<DayClass[]>([]);
  const [loadingDay, setLoadingDay] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const [weekGroups, setWeekGroups] = useState<ClassRosterGroup[]>([]);
  const [loadingWeek, setLoadingWeek] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
    } else if (isProfesorRole(profile?.role)) {
      // ok, stays
    } else if (isKnownRole(profile?.role)) {
      router.replace("/");
    } else if (profile) {
      router.replace(INCOMPLETE_PROFILE_ROUTE);
    }
  }, [authLoading, user, profile, router]);

  const fetchDay = useCallback(async (iso: string) => {
    setLoadingDay(true);
    const { data, error } = await getProfessorDayRoster(iso);
    setDayClasses(data);
    setError(error);
    setLoadingDay(false);
  }, []);

  const fetchWeek = useCallback(async () => {
    setLoadingWeek(true);
    const { data, error } = await getProfessorClassRoster();
    setWeekGroups(data);
    setError(error);
    setLoadingWeek(false);
  }, []);

  useEffect(() => {
    if (user && profile?.role === "profesor" && tab === "dia") fetchDay(dateISO);
  }, [user, profile, tab, dateISO, fetchDay]);

  useEffect(() => {
    if (user && profile?.role === "profesor" && tab === "semana" && weekGroups.length === 0) fetchWeek();
  }, [user, profile, tab, weekGroups.length, fetchWeek]);

  const shiftDate = (days: number) => {
    const d = parseLocalISO(dateISO);
    d.setDate(d.getDate() + days);
    setDateISO(toLocalISO(d));
  };

  const handleMark = async (
    cls: DayClass,
    userId: string,
    next: "attended" | "no_show" | "confirmed",
  ) => {
    const key = `${cls.scheduleId}:${userId}`;
    setSavingKey(key);

    // Optimistic: the professor is marking a room full of people, waiting on a
    // round-trip per tap would make it unusable.
    const previous = dayClasses;
    setDayClasses((prev) =>
      prev.map((c) =>
        c.scheduleId !== cls.scheduleId
          ? c
          : {
              ...c,
              attendees: c.attendees.map((a) =>
                a.userId === userId ? { ...a, status: next as AttendanceStatus } : a,
              ),
            },
      ),
    );

    const res = await markAttendance(cls.scheduleId, dateISO, userId, next);
    setSavingKey(null);

    if (!res.success) {
      setDayClasses(previous); // roll back so the UI never lies about what was saved
      toast.push(res.error || "No se pudo guardar la asistencia.", "danger");
    }
  };

  const totals = useMemo(() => {
    let esperados = 0;
    let presentes = 0;
    for (const c of dayClasses) {
      esperados += c.attendees.length;
      presentes += c.attendees.filter((a) => a.status === "attended").length;
    }
    return { esperados, presentes };
  }, [dayClasses]);

  const weekByDay = useMemo(() => {
    const map = new Map<number, ClassRosterGroup[]>();
    for (const g of weekGroups) {
      const list = map.get(g.dayOfWeek) || [];
      list.push(g);
      map.set(g.dayOfWeek, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [weekGroups]);

  if (authLoading || !profile) {
    return (
      <div className="flex h-dvh items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-12 animate-pulse items-center justify-center rounded-2xl bg-accent-gradient glow-accent">
            <Dumbbell size={24} className="text-white" />
          </div>
          <span className="text-sm text-faint">Cargando actividades…</span>
        </div>
      </div>
    );
  }

  const displayName = profile.full_name || "Profesor";

  return (
    <div className="min-h-dvh bg-bg text-fg pb-16">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-accent-gradient glow-accent-sm">
              <Dumbbell size={18} className="text-white" />
            </div>
            <div>
              <span className="block text-base font-bold tracking-tight text-fg">
                {organization?.name || "Lang Gym"}
              </span>
              <span className="text-[11px] text-faint">Panel de actividades</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-[13px] text-muted">{displayName}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut()}
              className="text-muted hover:text-danger px-2.5"
              title="Cerrar sesión"
            >
              <LogOut size={16} />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-fg">Asistencia</h1>
            <p className="text-xs text-muted mt-0.5">Marcá quién vino a cada clase</p>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
            {(["dia", "semana"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                  tab === t ? "bg-accent/15 text-accent" : "text-muted hover:text-fg",
                )}
              >
                {t === "dia" ? "Por día" : "Semana completa"}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] text-danger">
            {error}
          </div>
        )}

        {tab === "dia" ? (
          <>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3 py-2.5">
              <Button variant="ghost" size="sm" onClick={() => shiftDate(-1)} title="Día anterior">
                <ChevronLeft size={18} />
              </Button>
              <div className="flex flex-col items-center min-w-0">
                <div className="flex items-center gap-2 font-semibold text-fg">
                  <CalendarDays size={15} className="text-accent" />
                  <span className="truncate">{humanDayLabel(dateISO)}</span>
                </div>
                <span className="text-[12px] text-muted">
                  {totals.presentes} de {totals.esperados} presentes
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => fetchDay(dateISO)} disabled={loadingDay} title="Actualizar">
                  <RefreshCw size={15} className={loadingDay ? "animate-spin" : ""} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => shiftDate(1)} title="Día siguiente">
                  <ChevronRight size={18} />
                </Button>
              </div>
            </div>

            {dateISO !== todayISO() && (
              <button
                type="button"
                onClick={() => setDateISO(todayISO())}
                className="w-full rounded-xl border border-accent/30 bg-accent/[0.06] px-4 py-2 text-[13px] font-medium text-accent transition-colors hover:border-accent/50"
              >
                Volver a hoy
              </button>
            )}

            {loadingDay ? (
              <div className="rounded-2xl border border-border bg-card/40 p-10 flex justify-center">
                <span className="text-xs text-muted animate-pulse">Cargando la lista del día…</span>
              </div>
            ) : dayClasses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/30 p-10 text-center">
                <p className="text-sm text-muted">No hay clases con alumnos anotados este día.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {dayClasses.map((c) => (
                  <DayClassCard
                    key={c.scheduleId}
                    cls={c}
                    dateISO={dateISO}
                    savingKey={savingKey}
                    onMark={handleMark}
                  />
                ))}
              </div>
            )}
          </>
        ) : loadingWeek ? (
          <div className="rounded-2xl border border-border bg-card/40 p-10 flex justify-center">
            <span className="text-xs text-muted animate-pulse">Cargando actividades…</span>
          </div>
        ) : weekGroups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/30 p-10 text-center">
            <p className="text-sm text-muted">Todavía no hay actividades activas configuradas.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {weekByDay.map(([dow, groups]) => (
              <section key={dow}>
                <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-faint">
                  {DAYS_ES[dow]}
                </h2>
                <div className="space-y-3">
                  {groups.map((g) => (
                    <WeekClassCard key={g.scheduleId} group={g} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <ToastViewport />
    </div>
  );
}
