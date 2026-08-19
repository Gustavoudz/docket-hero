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
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
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
          battery_health: number | null
          cancel_reason: string | null
          completed_at: string | null
          converted_from_appointment_id: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
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
          profit_cents: number | null
          record_type: Database["public"]["Enums"]["record_type"]
          sale_amount: number | null
          sale_id: string | null
          scheduled_at: string
          scheduled_date: string | null
          seller_id: string | null
          status: Database["public"]["Enums"]["appointment_status"]
          tag: string | null
          updated_at: string
        }
        Insert: {
          attendant_id: string
          battery_health?: number | null
          cancel_reason?: string | null
          completed_at?: string | null
          converted_from_appointment_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
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
          profit_cents?: number | null
          record_type?: Database["public"]["Enums"]["record_type"]
          sale_amount?: number | null
          sale_id?: string | null
          scheduled_at: string
          scheduled_date?: string | null
          seller_id?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          tag?: string | null
          updated_at?: string
        }
        Update: {
          attendant_id?: string
          battery_health?: number | null
          cancel_reason?: string | null
          completed_at?: string | null
          converted_from_appointment_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
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
          profit_cents?: number | null
          record_type?: Database["public"]["Enums"]["record_type"]
          sale_amount?: number | null
          sale_id?: string | null
          scheduled_at?: string
          scheduled_date?: string | null
          seller_id?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          tag?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_converted_from_appointment_id_fkey"
            columns: ["converted_from_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
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
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
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
      commissions: {
        Row: {
          amount: number
          completed_at: string
          created_at: string
          device_model: string | null
          id: string
          sale_appointment_id: string
          seller_id: string
          source_appointment_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          completed_at?: string
          created_at?: string
          device_model?: string | null
          id?: string
          sale_appointment_id: string
          seller_id: string
          source_appointment_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          completed_at?: string
          created_at?: string
          device_model?: string | null
          id?: string
          sale_appointment_id?: string
          seller_id?: string
          source_appointment_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_sale_appointment_id_fkey"
            columns: ["sale_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_source_appointment_id_fkey"
            columns: ["source_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          cpf: string
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          cpf: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          cpf?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          whatsapp?: string | null
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
          apple_id: string | null
          appointment_id: string | null
          battery_health: number | null
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
          apple_id?: string | null
          appointment_id?: string | null
          battery_health?: number | null
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
          apple_id?: string | null
          appointment_id?: string | null
          battery_health?: number | null
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
      payments: {
        Row: {
          authorization_code: string | null
          card_brand: string | null
          card_last4: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          fee_amount: number
          gross_amount: number
          id: string
          installment_value: number | null
          installments: number
          method: Database["public"]["Enums"]["payment_method"]
          net_amount: number
          notes: string | null
          nsu: string | null
          reference: string
          sale_id: string
          status: Database["public"]["Enums"]["payment_status"]
          terminal: string | null
          transaction_code: string | null
          updated_at: string
        }
        Insert: {
          authorization_code?: string | null
          card_brand?: string | null
          card_last4?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          fee_amount?: number
          gross_amount?: number
          id?: string
          installment_value?: number | null
          installments?: number
          method: Database["public"]["Enums"]["payment_method"]
          net_amount?: number
          notes?: string | null
          nsu?: string | null
          reference?: string
          sale_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          terminal?: string | null
          transaction_code?: string | null
          updated_at?: string
        }
        Update: {
          authorization_code?: string | null
          card_brand?: string | null
          card_last4?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          fee_amount?: number
          gross_amount?: number
          id?: string
          installment_value?: number | null
          installments?: number
          method?: Database["public"]["Enums"]["payment_method"]
          net_amount?: number
          notes?: string | null
          nsu?: string | null
          reference?: string
          sale_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          terminal?: string | null
          transaction_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
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
      receipts: {
        Row: {
          created_at: string
          customer_email: string | null
          id: string
          public_token: string
          receipt_number: number
          sale_id: string
          sent_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          id?: string
          public_token?: string
          receipt_number?: number
          sale_id: string
          sent_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          id?: string
          public_token?: string
          receipt_number?: number
          sale_id?: string
          sent_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: true
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          appointment_id: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          customer_id: string | null
          discount: number
          id: string
          inventory_item_id: string | null
          reference: string
          sale_number: number
          seller_id: string
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          customer_id?: string | null
          discount?: number
          id?: string
          inventory_item_id?: string | null
          reference?: string
          sale_number?: number
          seller_id: string
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          customer_id?: string | null
          discount?: number
          id?: string
          inventory_item_id?: string | null
          reference?: string
          sale_number?: number
          seller_id?: string
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
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
      trade_in_defects: {
        Row: {
          active: boolean
          created_at: string
          discount: number
          id: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          discount?: number
          id?: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          discount?: number
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      trade_in_models: {
        Row: {
          active: boolean
          base_value: number
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_value?: number
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_value?: number
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
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
      create_payments_from_appointment: {
        Args: { _appointment_id: string; _sale_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_gerente: { Args: never; Returns: boolean }
      reset_test_data: { Args: never; Returns: Json }
      write_audit_log: {
        Args: {
          _action: string
          _details: Json
          _entity_id: string
          _entity_type: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "gerente" | "atendente" | "vendedora"
      appointment_status:
        | "pendente"
        | "concluido"
        | "cancelado"
        | "legado"
        | "convertido"
      inventory_status:
        | "disponivel"
        | "reservado"
        | "vendido"
        | "manutencao"
        | "incompleto"
      payment_method: "pix" | "debito" | "credito" | "dinheiro"
      payment_status:
        | "aguardando"
        | "aprovado"
        | "recusado"
        | "cancelado"
        | "estornado"
      record_type: "agendamento" | "venda"
      sale_status:
        | "rascunho"
        | "aguardando_pagamento"
        | "pago"
        | "cancelado"
        | "estornado"
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
      app_role: ["gerente", "atendente", "vendedora"],
      appointment_status: [
        "pendente",
        "concluido",
        "cancelado",
        "legado",
        "convertido",
      ],
      inventory_status: [
        "disponivel",
        "reservado",
        "vendido",
        "manutencao",
        "incompleto",
      ],
      payment_method: ["pix", "debito", "credito", "dinheiro"],
      payment_status: [
        "aguardando",
        "aprovado",
        "recusado",
        "cancelado",
        "estornado",
      ],
      record_type: ["agendamento", "venda"],
      sale_status: [
        "rascunho",
        "aguardando_pagamento",
        "pago",
        "cancelado",
        "estornado",
      ],
    },
  },
} as const
