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

  applyImport: (parsed: ParsedStudent[], archivo: string, erroresCount: number) => ApplyImportSummary;
  addFollowUp: (
    studentId: string,
    data: { tipo: FollowUpTipo; canal: "whatsapp" | "manual"; mensaje?: string; resultado?: FollowUpResultado },
  ) => void;
  setFollowUpResultado: (studentId: string, followUpId: string, resultado: FollowUpResultado) => void;
  updateStudent: (studentId: string, patch: Partial<Student>) => void;
  updateConfig: (patch: Partial<Config>) => void;
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
          // Detect recovery: previously absent, now attending again, with a pending recovery follow-up.
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

        const record: ImportRecord = {
          id: uid("imp"),
          fecha: now,
          archivo,
          nuevos,
          actualizados,
          errores: erroresCount,
          total: parsed.length,
        };

        set({ students: next, imports: [record, ...get().imports].slice(0, 50), hasData: true });
        return { nuevos, actualizados, recuperadosDetectados };
      },

      addFollowUp: (studentId, data) => {
        const followUp: FollowUp = {
          id: uid("fu"),
          fecha: new Date().toISOString(),
          tipo: data.tipo,
          canal: data.canal,
          mensaje: data.mensaje,
          resultado: data.resultado ?? "contactado",
        };
        set({
          students: get().students.map((s) =>
            s.id === studentId ? { ...s, followUps: [followUp, ...s.followUps] } : s,
          ),
        });
      },

      setFollowUpResultado: (studentId, followUpId, resultado) => {
        set({
          students: get().students.map((s) =>
            s.id === studentId
              ? { ...s, followUps: s.followUps.map((f) => (f.id === followUpId ? { ...f, resultado } : f)) }
              : s,
          ),
        });
      },

      updateStudent: (studentId, patch) => {
        set({
          students: get().students.map((s) =>
            s.id === studentId ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s,
          ),
        });
      },

      updateConfig: (patch) => set({ config: { ...get().config, ...patch } }),

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
