export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      appointment_tags: {
        Row: {
          active: boolean
          color: string
          created_at: string
          id: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string
          created_at?: string
          id?: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          attendant_id: string
          cancel_reason: string | null
          completed_at: string | null
          created_at: string
          customer_instagram: string | null
          customer_name: string
          customer_phone: string | null
          deposit_amount: number | null
          deposit_paid: boolean
          device_model: string
          device_serial_number: string | null
          id: string
          installment_value: number | null
          installments: number | null
          inventory_device_id: string | null
          notes: string | null
          payment_method: string | null
          payments: Json
          product_price: number | null
          sale_amount: number | null
          sale_id: string | null
          scheduled_at: string
          scheduled_date: string | null
          status: Database["public"]["Enums"]["appointment_status"]
          tag: string | null
          updated_at: string
        }
        Insert: {
          attendant_id: string
          cancel_reason?: string | null
          completed_at?: string | null
          created_at?: string
          customer_instagram?: string | null
          customer_name: string
          customer_phone?: string | null
          deposit_amount?: number | null
          deposit_paid?: boolean
          device_model: string
          device_serial_number?: string | null
          id?: string
          installment_value?: number | null
          installments?: number | null
          inventory_device_id?: string | null
          notes?: string | null
          payment_method?: string | null
          payments?: Json
          product_price?: number | null
          sale_amount?: number | null
          sale_id?: string | null
          scheduled_at: string
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          tag?: string | null
          updated_at?: string
        }
        Update: {
          attendant_id?: string
          cancel_reason?: string | null
          completed_at?: string | null
          created_at?: string
          customer_instagram?: string | null
          customer_name?: string
          customer_phone?: string | null
          deposit_amount?: number | null
          deposit_paid?: boolean
          device_model?: string
          device_serial_number?: string | null
          id?: string
          installment_value?: number | null
          installments?: number | null
          inventory_device_id?: string | null
          notes?: string | null
          payment_method?: string | null
          payments?: Json
          product_price?: number | null
          sale_amount?: number | null
          sale_id?: string | null
          scheduled_at?: string
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          tag?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      attendant_colors: {
        Row: {
          color: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cancel_reasons: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      day_closures: {
        Row: {
          attendant_id: string
          cancel_reasons: Json
          cancelled_count: number
          closed_at: string
          closure_date: string
          completed_count: number
          conversion_rate: number
          id: string
          total_appointments: number
        }
        Insert: {
          attendant_id: string
          cancel_reasons?: Json
          cancelled_count?: number
          closed_at?: string
          closure_date: string
          completed_count?: number
          conversion_rate?: number
          id?: string
          total_appointments?: number
        }
        Update: {
          attendant_id?: string
          cancel_reasons?: Json
          cancelled_count?: number
          closed_at?: string
          closure_date?: string
          completed_count?: number
          conversion_rate?: number
          id?: string
          total_appointments?: number
        }
        Relationships: []
      }
      device_models: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      inventory_audits: {
        Row: {
          audit_date: string
          confirmed_by: string | null
          created_at: string
          divergence_note: string | null
          id: string
          items_count: number
          matched: boolean
          total_cost: number
        }
        Insert: {
          audit_date: string
          confirmed_by?: string | null
          created_at?: string
          divergence_note?: string | null
          id?: string
          items_count?: number
          matched?: boolean
          total_cost?: number
        }
        Update: {
          audit_date?: string
          confirmed_by?: string | null
          created_at?: string
          divergence_note?: string | null
          id?: string
          items_count?: number
          matched?: boolean
          total_cost?: number
        }
        Relationships: []
      }
      inventory_costs: {
        Row: {
          cost_price: number
          item_id: string
          updated_at: string
        }
        Insert: {
          cost_price: number
          item_id: string
          updated_at?: string
        }
        Update: {
          cost_price?: number
          item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_costs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_events: {
        Row: {
          actor_id: string | null
          appointment_id: string | null
          created_at: string
          id: string
          item_id: string
          kind: string
          reason: string | null
        }
        Insert: {
          actor_id?: string | null
          appointment_id?: string | null
          created_at?: string
          id?: string
          item_id: string
          kind: string
          reason?: string | null
        }
        Update: {
          actor_id?: string | null
          appointment_id?: string | null
          created_at?: string
          id?: string
          item_id?: string
          kind?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          apple_id: string
          appointment_id: string | null
          color: string | null
          condition: string
          created_at: string
          created_by: string | null
          device_model: string
          entered_at: string
          id: string
          imei: string | null
          notes: string | null
          sale_price: number | null
          serial_number: string | null
          sold_at: string | null
          status: Database["public"]["Enums"]["inventory_status"]
          storage: string | null
          updated_at: string
        }
        Insert: {
          apple_id: string
          appointment_id?: string | null
          color?: string | null
          condition?: string
          created_at?: string
          created_by?: string | null
          device_model: string
          entered_at?: string
          id?: string
          imei?: string | null
          notes?: string | null
          sale_price?: number | null
          serial_number?: string | null
          sold_at?: string | null
          status?: Database["public"]["Enums"]["inventory_status"]
          storage?: string | null
          updated_at?: string
        }
        Update: {
          apple_id?: string
          appointment_id?: string | null
          color?: string | null
          condition?: string
          created_at?: string
          created_by?: string | null
          device_model?: string
          entered_at?: string
          id?: string
          imei?: string | null
          notes?: string | null
          sale_price?: number | null
          serial_number?: string | null
          sold_at?: string | null
          status?: Database["public"]["Enums"]["inventory_status"]
          storage?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          appointment_id: string | null
          created_at: string
          id: string
          kind: string
          message: string
          read_by: Json
        }
        Insert: {
          actor_id?: string | null
          appointment_id?: string | null
          created_at?: string
          id?: string
          kind: string
          message: string
          read_by?: Json
        }
        Update: {
          actor_id?: string | null
          appointment_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          message?: string
          read_by?: Json
        }
        Relationships: [
          {
            foreignKeyName: "notifications_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      status_colors: {
        Row: {
          color: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          color: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          color?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_gerente: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "gerente" | "atendente"
      appointment_status: "pendente" | "concluido" | "cancelado"
      inventory_status: "disponivel" | "reservado" | "vendido" | "manutencao"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["gerente", "atendente"],
      appointment_status: ["pendente", "concluido", "cancelado"],
      inventory_status: ["disponivel", "reservado", "vendido", "manutencao"],
    },
  },
} as const
