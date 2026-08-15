"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Config,
  FollowUp,
  FollowUpResultado,
  FollowUpTipo,
  ImportRecord,
  ParsedStudent,
  Snapshot,
  Student,
} from "./types";
import { DEFAULT_CONFIG } from "./config";
import { uid } from "./utils";
import { daysSince } from "./dates";
import { fetchStudentsFromSupabase } from "./services/studentsService";
import { createFollowUpInSupabase, updateFollowUpResultadoInSupabase } from "./services/followUpsService";
import { fetchConfigFromSupabase, saveConfigToSupabase } from "./services/configService";

export interface ApplyImportSummary {
  nuevos: number;
  actualizados: number;
  recuperadosDetectados: number;
}

interface AppState {
  students: Student[];
  config: Config;
  imports: ImportRecord[];
  hasData: boolean;
  isLoadingFromSupabase: boolean;
  lastSyncError: string | null;

  // Synchronization with Supabase
  syncFromSupabase: (organizationId: string) => Promise<void>;

  applyImport: (parsed: ParsedStudent[], archivo: string, erroresCount: number) => ApplyImportSummary;
  setSyncedData: (students: Student[], importRecord?: ImportRecord) => void;
  addFollowUp: (
    studentId: string,
    data: { tipo: FollowUpTipo; canal: "whatsapp" | "manual"; mensaje?: string; resultado?: FollowUpResultado },
    organizationId?: string,
  ) => Promise<void>;
  setFollowUpResultado: (studentId: string, followUpId: string, resultado: FollowUpResultado, organizationId?: string) => Promise<void>;
  updateStudent: (studentId: string, patch: Partial<Student>) => void;
  updateConfig: (patch: Partial<Config>, organizationId?: string) => Promise<void>;
  loadStudents: (students: Student[]) => void;
  reset: () => void;
}

function snapshotOf(s: Pick<Student, "fechaFin" | "ultimaAsistencia" | "membresia" | "habilitado">): Snapshot {
  return {
    fecha: new Date().toISOString(),
    fechaFin: s.fechaFin,
    ultimaAsistencia: s.ultimaAsistencia,
    membresia: s.membresia,
    habilitado: s.habilitado,
  };
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      students: [],
      config: DEFAULT_CONFIG,
      imports: [],
      hasData: false,
      isLoadingFromSupabase: false,
      lastSyncError: null,

      syncFromSupabase: async (organizationId: string) => {
        if (!organizationId) return;
        set({ isLoadingFromSupabase: true, lastSyncError: null });

        try {
          // 1. Fetch Students, Follow-ups, Snapshots
          const cloudStudents = await fetchStudentsFromSupabase(organizationId);

          // 2. Fetch Config
          const cloudConfig = await fetchConfigFromSupabase(organizationId);

          set({
            students: cloudStudents,
            config: cloudConfig ? { ...get().config, ...cloudConfig } : get().config,
            hasData: cloudStudents.length > 0,
            isLoadingFromSupabase: false,
          });
        } catch (err: any) {
          console.warn("Could not sync from Supabase, relying on local state:", err);
          set({
            isLoadingFromSupabase: false,
            lastSyncError: err?.message || "Error al sincronizar con el servidor",
          });
        }
      },

      setSyncedData: (students: Student[], importRecord?: ImportRecord) => {
        set({
          students,
          hasData: students.length > 0,
          imports: importRecord ? [importRecord, ...get().imports].slice(0, 50) : get().imports,
        });
      },

      applyImport: (parsed, archivo, erroresCount) => {
        const now = new Date().toISOString();
        const config = get().config;
        const existing = new Map(get().students.map((s) => [s.idSocio, s]));
        let nuevos = 0;
        let actualizados = 0;
        let recuperadosDetectados = 0;

        const next: Student[] = [...get().students];
        const indexById = new Map(next.map((s, i) => [s.idSocio, i]));

        for (const p of parsed) {
          const prev = existing.get(p.idSocio);
          if (!prev) {
            nuevos++;
            const student: Student = {
              id: uid("st"),
              idSocio: p.idSocio,
              nombre: p.nombre,
              apellido: p.apellido,
              nombreCompleto: p.nombreCompleto,
              telefono: p.telefono,
              telefonoRaw: p.telefonoRaw,
              email: p.email,
              habilitado: p.habilitado,
              idMembresia: p.idMembresia,
              membresia: p.membresia,
              fechaFin: p.fechaFin,
              fechaAlta: p.fechaAlta,
              ultimaAsistencia: p.ultimaAsistencia,
              observacion: p.observacion,
              createdAt: now,
              updatedAt: now,
              snapshots: [snapshotOf(p)],
              followUps: [],
            };
            next.push(student);
            indexById.set(p.idSocio, next.length - 1);
            continue;
          }

          actualizados++;
          const prevAbsent =
            prev.ultimaAsistencia != null &&
            (daysSince(prev.ultimaAsistencia) ?? 0) >= config.diasRiesgo.nivel1;
          const nowRecent =
            p.ultimaAsistencia != null &&
            (daysSince(p.ultimaAsistencia) ?? 999) <= config.diasRiesgo.nivel1;
          let followUps = prev.followUps;
          if (prevAbsent && nowRecent) {
            followUps = prev.followUps.map((f) =>
              f.tipo === "recuperacion" && (f.resultado === "pendiente" || f.resultado === "contactado")
                ? { ...f, resultado: "recuperado" as FollowUpResultado }
                : f,
            );
            if (followUps.some((f, i) => f !== prev.followUps[i])) recuperadosDetectados++;
          }

          const merged: Student = {
            ...prev,
            nombre: p.nombre || prev.nombre,
            apellido: p.apellido || prev.apellido,
            nombreCompleto: p.nombreCompleto || prev.nombreCompleto,
            telefono: p.telefono ?? prev.telefono,
            telefonoRaw: p.telefonoRaw ?? prev.telefonoRaw,
            email: p.email ?? prev.email,
            habilitado: p.habilitado,
            idMembresia: p.idMembresia ?? prev.idMembresia,
            membresia: p.membresia ?? prev.membresia,
            fechaFin: p.fechaFin ?? prev.fechaFin,
            fechaAlta: prev.fechaAlta ?? p.fechaAlta,
            ultimaAsistencia: p.ultimaAsistencia ?? prev.ultimaAsistencia,
            observacion: p.observacion ?? prev.observacion,
            updatedAt: now,
            snapshots: [...prev.snapshots, snapshotOf(p)].slice(-50),
            followUps,
          };
          const idx = indexById.get(p.idSocio)!;
          next[idx] = merged;
        }

        const importedSocioSet = new Set(parsed.map((p) => p.idSocio).filter(Boolean));
        let bajas = 0;
        if (prevStudents.length > 0) {
          prevStudents.forEach((s) => {
            if (!importedSocioSet.has(s.idSocio)) bajas++;
          });
        }
        const permanecen = importedSocioSet.size - nuevos;

        const record: ImportRecord = {
          id: uid("imp"),
          fecha: now,
          archivo,
          nuevos,
          actualizados,
          bajas,
          permanecen,
          errores: erroresCount,
          total: parsed.length,
        };

        set({ students: next, imports: [record, ...get().imports].slice(0, 50), hasData: true });
        return { nuevos, actualizados, recuperadosDetectados };
      },

      addFollowUp: async (studentId, data, organizationId) => {
        const tempId = uid("fu");
        const followUp: FollowUp = {
          id: tempId,
          fecha: new Date().toISOString(),
          tipo: data.tipo,
          canal: data.canal,
          mensaje: data.mensaje,
          resultado: data.resultado ?? "contactado",
        };

        // 1. Optimistic local update
        set({
          students: get().students.map((s) =>
            s.id === studentId ? { ...s, followUps: [followUp, ...s.followUps] } : s,
          ),
        });

        // 2. Persist to Supabase if organizationId is present
        if (organizationId) {
          try {
            const res = await createFollowUpInSupabase(organizationId, studentId, followUp);
            if (res.success && res.id) {
              // Update with real DB UUID
              set({
                students: get().students.map((s) =>
                  s.id === studentId
                    ? {
                        ...s,
                        followUps: s.followUps.map((f) => (f.id === tempId ? { ...f, id: res.id! } : f)),
                      }
                    : s,
                ),
              });
            }
          } catch (err) {
            console.error("Error persisting follow up to Supabase:", err);
          }
        }
      },

      setFollowUpResultado: async (studentId, followUpId, resultado, organizationId) => {
        set({
          students: get().students.map((s) =>
            s.id === studentId
              ? { ...s, followUps: s.followUps.map((f) => (f.id === followUpId ? { ...f, resultado } : f)) }
              : s,
          ),
        });

        if (organizationId) {
          try {
            await updateFollowUpResultadoInSupabase(organizationId, followUpId, resultado);
          } catch (err) {
            console.error("Error updating follow up in Supabase:", err);
          }
        }
      },

      updateStudent: (studentId, patch) => {
        set({
          students: get().students.map((s) =>
            s.id === studentId ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s,
          ),
        });
      },

      updateConfig: async (patch, organizationId) => {
        set({ config: { ...get().config, ...patch } });
        if (organizationId) {
          try {
            await saveConfigToSupabase(organizationId, patch);
          } catch (err) {
            console.error("Error saving config to Supabase:", err);
          }
        }
      },

      loadStudents: (students) =>
        set({
          students,
          hasData: students.length > 0,
          imports: [
            {
              id: uid("imp"),
              fecha: new Date().toISOString(),
              archivo: "Datos de ejemplo",
              nuevos: students.length,
              actualizados: 0,
              errores: 0,
              total: students.length,
            },
          ],
        }),

      reset: () => set({ students: [], imports: [], hasData: false }),
    }),
    {
      name: "langgym-store",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        students: state.students,
        config: state.config,
        imports: state.imports,
        hasData: state.hasData,
      }),
    },
  ),
);
