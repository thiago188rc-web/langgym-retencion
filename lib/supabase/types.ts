export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "owner" | "admin" | "staff" | "cliente";
export type ReservationStatus = "confirmed" | "cancelled" | "attended" | "no_show";

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
          role: UserRole;
          student_id: string | null;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          organization_id: string;
          email: string;
          full_name?: string;
          role?: UserRole;
          student_id?: string | null;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          full_name?: string;
          role?: UserRole;
          student_id?: string | null;
          phone?: string | null;
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
      class_types: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          color: string;
          default_capacity: number | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          color?: string;
          default_capacity?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string | null;
          color?: string;
          default_capacity?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      class_schedules: {
        Row: {
          id: string;
          organization_id: string;
          class_type_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string | null;
          capacity: number | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          class_type_id: string;
          day_of_week: number;
          start_time: string;
          end_time?: string | null;
          capacity?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          class_type_id?: string;
          day_of_week?: number;
          start_time?: string;
          end_time?: string | null;
          capacity?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      reservations: {
        Row: {
          id: string;
          organization_id: string;
          class_schedule_id: string;
          class_type_id: string;
          user_id: string;
          student_id: string | null;
          class_date: string;
          status: ReservationStatus;
          created_at: string;
          cancelled_at: string | null;
          attended_at: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          class_schedule_id: string;
          class_type_id: string;
          user_id: string;
          student_id?: string | null;
          class_date: string;
          status?: ReservationStatus;
          created_at?: string;
          cancelled_at?: string | null;
          attended_at?: string | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          class_schedule_id?: string;
          class_type_id?: string;
          user_id?: string;
          student_id?: string | null;
          class_date?: string;
          status?: ReservationStatus;
          created_at?: string;
          cancelled_at?: string | null;
          attended_at?: string | null;
          notes?: string | null;
        };
      };
    };
    Functions: {
      book_class: {
        Args: {
          p_schedule_id: string;
          p_class_date: string;
        };
        Returns: Json;
      };
      cancel_reservation: {
        Args: {
          p_reservation_id: string;
        };
        Returns: Json;
      };
      get_available_classes_for_date: {
        Args: {
          p_date: string;
        };
        Returns: Array<{
          schedule_id: string;
          class_type_id: string;
          class_name: string;
          class_description: string | null;
          class_color: string;
          day_of_week: number;
          start_time: string;
          end_time: string | null;
          capacity: number | null;
          confirmed_reservations: number;
          available_spots: number | null;
          is_user_reserved: boolean;
        }>;
      };
      link_profile_to_student: {
        Args: {
          p_profile_id: string;
          p_student_id: string;
        };
        Returns: Json;
      };
      unlink_profile_from_student: {
        Args: {
          p_profile_id: string;
        };
        Returns: Json;
      };
      get_admin_classes_for_date: {
        Args: {
          p_date: string;
        };
        Returns: Array<{
          schedule_id: string;
          class_type_id: string;
          class_name: string;
          class_description: string | null;
          class_color: string;
          day_of_week: number;
          start_time: string;
          end_time: string | null;
          capacity: number | null;
          schedule_active: boolean;
          class_type_active: boolean;
          confirmed_count: number;
          attended_count: number;
          no_show_count: number;
          cancelled_count: number;
          available_spots: number | null;
        }>;
      };
      get_class_attendees: {
        Args: {
          p_schedule_id: string;
          p_class_date: string;
        };
        Returns: Array<{
          reservation_id: string;
          user_id: string;
          student_id: string | null;
          status: string;
          created_at: string;
          attended_at: string | null;
          cancelled_at: string | null;
          notes: string | null;
          profile_full_name: string | null;
          profile_email: string | null;
          profile_phone: string | null;
          student_id_socio: string | null;
          student_nombre: string | null;
          student_telefono: string | null;
          student_membresia: string | null;
        }>;
      };
      admin_update_attendance: {
        Args: {
          p_reservation_id: string;
          p_status: string;
        };
        Returns: Json;
      };
      admin_manual_book_class: {
        Args: {
          p_schedule_id: string;
          p_class_date: string;
          p_user_id: string | null;
          p_student_id: string | null;
        };
        Returns: Json;
      };
      admin_update_schedule_capacity: {
        Args: {
          p_schedule_id: string;
          p_capacity: number | null;
        };
        Returns: Json;
      };
    };
  };
}
