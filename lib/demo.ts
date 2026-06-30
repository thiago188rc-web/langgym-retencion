import type { Student } from "./types";
import { toLocalISO, todayISO } from "./dates";
import { uid } from "./utils";

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toLocalISO(d);
}

interface Seed {
  idSocio: string;
  nombre: string;
  apellido: string;
  membresia: string;
  tel: string;
  ultAsistDias: number | null; // days ago, null = no data
  venceDias: number; // days from today (negative = vencida)
}

/** Realistic-looking roster so the panel looks complete in a sales demo. */
const SEEDS: Seed[] = [
  { idSocio: "4665", nombre: "Guillermo", apellido: "Gonzalez", membresia: "Pase libre", tel: "5492235670245", ultAsistDias: 2, venceDias: 0 },
  { idSocio: "4673", nombre: "Lucrecia", apellido: "Colace", membresia: "Pase libre", tel: "5492235851985", ultAsistDias: 1, venceDias: 0 },
  { idSocio: "3376", nombre: "Juan", apellido: "Galera", membresia: "Jubilados 20%", tel: "5492236893421", ultAsistDias: 9, venceDias: 0 },
  { idSocio: "4662", nombre: "Mariana", apellido: "Albanese", membresia: "Pase libre", tel: "5492235942606", ultAsistDias: 16, venceDias: -3 },
  { idSocio: "4596", nombre: "Matias", apellido: "Castorina", membresia: "Pase libre", tel: "5492235235627", ultAsistDias: 8, venceDias: 2 },
  { idSocio: "4606", nombre: "Sebastian", apellido: "Mendiburu", membresia: "Funcional + Gym x3", tel: "5492235112233", ultAsistDias: 22, venceDias: -10 },
  { idSocio: "4701", nombre: "Carla", apellido: "Ferreyra", membresia: "Mensual", tel: "5492234556677", ultAsistDias: 31, venceDias: -12 },
  { idSocio: "4712", nombre: "Diego", apellido: "Sosa", membresia: "Mensual", tel: "5492235998877", ultAsistDias: 45, venceDias: -25 },
  { idSocio: "4720", nombre: "Florencia", apellido: "Ramirez", membresia: "Funcional", tel: "5492236112299", ultAsistDias: 3, venceDias: 5 },
  { idSocio: "4733", nombre: "Nicolas", apellido: "Quiroga", membresia: "Pase libre", tel: "5492235443322", ultAsistDias: 12, venceDias: -1 },
  { idSocio: "4744", nombre: "Sofia", apellido: "Mendez", membresia: "Mensual", tel: "5492236778899", ultAsistDias: 7, venceDias: 1 },
  { idSocio: "4755", nombre: "Tomas", apellido: "Acosta", membresia: "Gym x3", tel: "5492235667788", ultAsistDias: 18, venceDias: -6 },
  { idSocio: "4766", nombre: "Valentina", apellido: "Lopez", membresia: "Pase libre", tel: "5492234223344", ultAsistDias: 1, venceDias: 14 },
  { idSocio: "4777", nombre: "Ezequiel", apellido: "Diaz", membresia: "Mensual", tel: "5492235889900", ultAsistDias: 38, venceDias: -20 },
  { idSocio: "4788", nombre: "Camila", apellido: "Ibarra", membresia: "Funcional", tel: "5492236554433", ultAsistDias: 5, venceDias: 3 },
  { idSocio: "4799", nombre: "Lucas", apellido: "Romero", membresia: "Pase libre", tel: "5492235334455", ultAsistDias: 14, venceDias: -2 },
  { idSocio: "4810", nombre: "Agustina", apellido: "Vega", membresia: "Mensual", tel: "5492234667788", ultAsistDias: 2, venceDias: 20 },
  { idSocio: "4821", nombre: "Martin", apellido: "Suarez", membresia: "Gym x3", tel: "5492235221100", ultAsistDias: 27, venceDias: -8 },
  { idSocio: "4832", nombre: "Brenda", apellido: "Molina", membresia: "Pase libre", tel: "5492236998811", ultAsistDias: 4, venceDias: 0 },
  { idSocio: "4843", nombre: "Federico", apellido: "Cabrera", membresia: "Mensual", tel: "5492235776655", ultAsistDias: 60, venceDias: -40 },
];

export function buildDemoStudents(): Student[] {
  const now = new Date().toISOString();
  return SEEDS.map((s) => {
    const ult = s.ultAsistDias == null ? null : dateOffset(s.ultAsistDias);
    const venceDate = new Date();
    venceDate.setDate(venceDate.getDate() + s.venceDias);
    return {
      id: uid("st"),
      idSocio: s.idSocio,
      nombre: s.nombre,
      apellido: s.apellido,
      nombreCompleto: `${s.nombre} ${s.apellido}`,
      telefono: s.tel,
      telefonoRaw: s.tel,
      email: null,
      habilitado: true,
      idMembresia: null,
      membresia: s.membresia,
      fechaFin: toLocalISO(venceDate),
      fechaAlta: dateOffset(120 + Number(s.idSocio.slice(-2))),
      ultimaAsistencia: ult,
      observacion: null,
      createdAt: now,
      updatedAt: now,
      snapshots: [
        {
          fecha: now,
          fechaFin: toLocalISO(venceDate),
          ultimaAsistencia: ult,
          membresia: s.membresia,
          habilitado: true,
        },
      ],
      followUps: [],
    } satisfies Student;
  });
}

export const DEMO_TODAY = todayISO();
