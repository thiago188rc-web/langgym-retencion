"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Dumbbell, LogOut, Users, Phone, Clock, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { isProfesorRole, isKnownRole, INCOMPLETE_PROFILE_ROUTE } from "@/lib/auth/roleRouting";
import { getProfessorClassRoster, type ClassRosterGroup } from "@/lib/services/professorService";
import { formatClassTime } from "@/lib/dates";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const DAYS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function StatusPill({ status }: { status: string }) {
  const isPending = status === "pending";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        isPending ? "bg-warning/15 text-warning" : "bg-success/15 text-success",
      )}
    >
      {isPending ? "Pendiente" : "Activo"}
    </span>
  );
}

function ClassGroupCard({ group }: { group: ClassRosterGroup }) {
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
                <StatusPill status={entry.status} />
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

  const [groups, setGroups] = useState<ClassRosterGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guard: this panel is only for the 'profesor' role — never a default for
  // missing/unrecognized roles, never reachable by cliente or admin roles.
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

  const fetchRoster = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getProfessorClassRoster();
    setGroups(data);
    setError(error);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user && profile?.role === "profesor") {
      fetchRoster();
    }
  }, [user, profile, fetchRoster]);

  const groupsByDay = useMemo(() => {
    const map = new Map<number, ClassRosterGroup[]>();
    for (const g of groups) {
      const list = map.get(g.dayOfWeek) || [];
      list.push(g);
      map.set(g.dayOfWeek, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [groups]);

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
            <Button variant="ghost" size="sm" onClick={() => signOut()} className="text-muted hover:text-danger px-2.5" title="Cerrar sesión">
              <LogOut size={16} />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-fg">Actividades</h1>
            <p className="text-xs text-muted mt-0.5">Quién está anotado en cada clase</p>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchRoster} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>

        {error && (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] text-danger">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-border bg-card/40 p-10 flex justify-center items-center">
            <span className="text-xs text-muted animate-pulse">Cargando actividades…</span>
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/30 p-10 text-center">
            <p className="text-sm text-muted">Todavía no hay actividades activas configuradas.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupsByDay.map(([dow, dayGroups]) => (
              <section key={dow}>
                <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-faint">
                  {DAYS_ES[dow]}
                </h2>
                <div className="space-y-3">
                  {dayGroups.map((g) => (
                    <ClassGroupCard key={g.scheduleId} group={g} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
