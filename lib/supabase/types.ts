export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          owner_name: string;
          logo_url: string | null;
          country_code: string;
          mobile_prefix: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          owner_name?: string;
          logo_url?: string | null;
          country_code?: string;
          mobile_prefix?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          owner_name?: string;
          logo_url?: string | null;
          country_code?: string;
          mobile_prefix?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          full_name: string;
          role: "owner" | "admin" | "staff";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          organization_id: string;
          email: string;
          full_name?: string;
          role?: "owner" | "admin" | "staff";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          full_name?: string;
          role?: "owner" | "admin" | "staff";
          created_at?: string;
          updated_at?: string;
        };
      };
      configurations: {
        Row: {
          id: string;
          organization_id: string;
          dias_riesgo_nivel1: number;
          dias_riesgo_nivel2: number;
          dias_riesgo_nivel3: number;
          por_vencer_dias: number;
          template_recuperacion: string;
          template_cobro: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          dias_riesgo_nivel1?: number;
          dias_riesgo_nivel2?: number;
          dias_riesgo_nivel3?: number;
          por_vencer_dias?: number;
          template_recuperacion?: string;
          template_cobro?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          dias_riesgo_nivel1?: number;
          dias_riesgo_nivel2?: number;
          dias_riesgo_nivel3?: number;
          por_vencer_dias?: number;
          template_recuperacion?: string;
          template_cobro?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      students: {
        Row: {
          id: string;
          organization_id: string;
          id_socio: string;
          nombre: string;
          apellido: string;
          nombre_completo: string;
          telefono: string | null;
          telefono_raw: string | null;
          email: string | null;
          habilitado: boolean;
          id_membresia: string | null;
          membresia: string | null;
          fecha_fin: string | null;
          fecha_alta: string | null;
          ultima_asistencia: string | null;
          observacion: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          id_socio: string;
          nombre: string;
          apellido?: string;
          nombre_completo: string;
          telefono?: string | null;
          telefono_raw?: string | null;
          email?: string | null;
          habilitado?: boolean;
          id_membresia?: string | null;
          membresia?: string | null;
          fecha_fin?: string | null;
          fecha_alta?: string | null;
          ultima_asistencia?: string | null;
          observacion?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          id_socio?: string;
          nombre?: string;
          apellido?: string;
          nombre_completo?: string;
          telefono?: string | null;
          telefono_raw?: string | null;
          email?: string | null;
          habilitado?: boolean;
          id_membresia?: string | null;
          membresia?: string | null;
          fecha_fin?: string | null;
          fecha_alta?: string | null;
          ultima_asistencia?: string | null;
          observacion?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      snapshots: {
        Row: {
          id: string;
          organization_id: string;
          student_id: string;
          fecha: string;
          fecha_fin: string | null;
          ultima_asistencia: string | null;
          membresia: string | null;
          habilitado: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          student_id: string;
          fecha?: string;
          fecha_fin?: string | null;
          ultima_asistencia?: string | null;
          membresia?: string | null;
          habilitado?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          student_id?: string;
          fecha?: string;
          fecha_fin?: string | null;
          ultima_asistencia?: string | null;
          membresia?: string | null;
          habilitado?: boolean;
          created_at?: string;
        };
      };
      follow_ups: {
        Row: {
          id: string;
          organization_id: string;
          student_id: string;
          user_id: string | null;
          fecha: string;
          tipo: "recuperacion" | "cobro" | "nota";
          canal: "whatsapp" | "manual";
          mensaje: string | null;
          resultado: "pendiente" | "contactado" | "recuperado" | "sin_respuesta";
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          student_id: string;
          user_id?: string | null;
          fecha?: string;
          tipo: "recuperacion" | "cobro" | "nota";
          canal: "whatsapp" | "manual";
          mensaje?: string | null;
          resultado?: "pendiente" | "contactado" | "recuperado" | "sin_respuesta";
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          student_id?: string;
          user_id?: string | null;
          fecha?: string;
          tipo?: "recuperacion" | "cobro" | "nota";
          canal?: "whatsapp" | "manual";
          mensaje?: string | null;
          resultado?: "pendiente" | "contactado" | "recuperado" | "sin_respuesta";
          created_at?: string;
        };
      };
      import_records: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string | null;
          fecha: string;
          archivo: string;
          nuevos: number;
          actualizados: number;
          errores: number;
          total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id?: string | null;
          fecha?: string;
          archivo: string;
          nuevos?: number;
          actualizados?: number;
          errores?: number;
          total?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string | null;
          fecha?: string;
          archivo?: string;
          nuevos?: number;
          actualizados?: number;
          errores?: number;
          total?: number;
          created_at?: string;
        };
      };
    };
  };
}
