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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      cargos: {
        Row: {
          created_at: string
          id: string
          nome: string
          permissoes: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          permissoes?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          permissoes?: Json
          updated_at?: string
        }
        Relationships: []
      }
      client_contracts: {
        Row: {
          client_id: string
          conteudo_html: string
          created_at: string
          id: string
          pdf_url: string | null
          simulation_id: string | null
          template_id: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          conteudo_html?: string
          created_at?: string
          id?: string
          pdf_url?: string | null
          simulation_id?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          conteudo_html?: string
          created_at?: string
          id?: string
          pdf_url?: string | null
          simulation_id?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "simulations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          cpf: string | null
          created_at: string
          descricao_ambientes: string | null
          email: string | null
          id: string
          indicador_id: string | null
          nome: string
          numero_orcamento: string | null
          numero_orcamento_seq: number | null
          quantidade_ambientes: number | null
          telefone1: string | null
          telefone2: string | null
          updated_at: string
          vendedor: string | null
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          descricao_ambientes?: string | null
          email?: string | null
          id?: string
          indicador_id?: string | null
          nome: string
          numero_orcamento?: string | null
          numero_orcamento_seq?: number | null
          quantidade_ambientes?: number | null
          telefone1?: string | null
          telefone2?: string | null
          updated_at?: string
          vendedor?: string | null
        }
        Update: {
          cpf?: string | null
          created_at?: string
          descricao_ambientes?: string | null
          email?: string | null
          id?: string
          indicador_id?: string | null
          nome?: string
          numero_orcamento?: string | null
          numero_orcamento_seq?: number | null
          quantidade_ambientes?: number | null
          telefone1?: string | null
          telefone2?: string | null
          updated_at?: string
          vendedor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "indicadores"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          admin_password: string | null
          budget_validity_days: number
          codigo_loja: string | null
          company_name: string
          company_subtitle: string | null
          created_at: string
          id: string
          logo_url: string | null
          manager_password: string | null
          orcamento_numero_inicial: number
          updated_at: string
        }
        Insert: {
          admin_password?: string | null
          budget_validity_days?: number
          codigo_loja?: string | null
          company_name?: string
          company_subtitle?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          manager_password?: string | null
          orcamento_numero_inicial?: number
          updated_at?: string
        }
        Update: {
          admin_password?: string | null
          budget_validity_days?: number
          codigo_loja?: string | null
          company_name?: string
          company_subtitle?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          manager_password?: string | null
          orcamento_numero_inicial?: number
          updated_at?: string
        }
        Relationships: []
      }
      contract_templates: {
        Row: {
          arquivo_original_nome: string | null
          arquivo_original_url: string | null
          ativo: boolean
          conteudo_html: string
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          arquivo_original_nome?: string | null
          arquivo_original_url?: string | null
          ativo?: boolean
          conteudo_html?: string
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Update: {
          arquivo_original_nome?: string | null
          arquivo_original_url?: string | null
          ativo?: boolean
          conteudo_html?: string
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      discount_options: {
        Row: {
          created_at: string
          field_name: string
          id: string
          percentages: number[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_name: string
          id?: string
          percentages?: number[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_name?: string
          id?: string
          percentages?: number[]
          updated_at?: string
        }
        Relationships: []
      }
      financing_rates: {
        Row: {
          coefficient: number
          coeficiente_60: number
          coeficiente_90: number
          created_at: string
          id: string
          installments: number
          provider_name: string
          provider_type: string
          taxa_fixa: number
          updated_at: string
        }
        Insert: {
          coefficient?: number
          coeficiente_60?: number
          coeficiente_90?: number
          created_at?: string
          id?: string
          installments: number
          provider_name: string
          provider_type: string
          taxa_fixa?: number
          updated_at?: string
        }
        Update: {
          coefficient?: number
          coeficiente_60?: number
          coeficiente_90?: number
          created_at?: string
          id?: string
          installments?: number
          provider_name?: string
          provider_type?: string
          taxa_fixa?: number
          updated_at?: string
        }
        Relationships: []
      }
      indicadores: {
        Row: {
          ativo: boolean
          comissao_percentual: number
          created_at: string
          email: string | null
          foto_url: string | null
          id: string
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          comissao_percentual?: number
          created_at?: string
          email?: string | null
          foto_url?: string | null
          id?: string
          nome: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          comissao_percentual?: number
          created_at?: string
          email?: string | null
          foto_url?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      simulations: {
        Row: {
          arquivo_nome: string | null
          arquivo_url: string | null
          client_id: string
          created_at: string
          desconto1: number | null
          desconto2: number | null
          desconto3: number | null
          forma_pagamento: string
          id: string
          parcelas: number | null
          plus_percentual: number | null
          updated_at: string
          valor_entrada: number | null
          valor_final: number | null
          valor_parcela: number | null
          valor_tela: number
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_url?: string | null
          client_id: string
          created_at?: string
          desconto1?: number | null
          desconto2?: number | null
          desconto3?: number | null
          forma_pagamento?: string
          id?: string
          parcelas?: number | null
          plus_percentual?: number | null
          updated_at?: string
          valor_entrada?: number | null
          valor_final?: number | null
          valor_parcela?: number | null
          valor_tela?: number
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_url?: string | null
          client_id?: string
          created_at?: string
          desconto1?: number | null
          desconto2?: number | null
          desconto3?: number | null
          forma_pagamento?: string
          id?: string
          parcelas?: number | null
          plus_percentual?: number | null
          updated_at?: string
          valor_entrada?: number | null
          valor_final?: number | null
          valor_parcela?: number | null
          valor_tela?: number
        }
        Relationships: [
          {
            foreignKeyName: "simulations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          apelido: string | null
          ativo: boolean
          cargo_id: string | null
          created_at: string
          email: string | null
          foto_url: string | null
          id: string
          nome_completo: string
          primeiro_login: boolean
          senha: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          apelido?: string | null
          ativo?: boolean
          cargo_id?: string | null
          created_at?: string
          email?: string | null
          foto_url?: string | null
          id?: string
          nome_completo: string
          primeiro_login?: boolean
          senha?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          apelido?: string | null
          ativo?: boolean
          cargo_id?: string | null
          created_at?: string
          email?: string | null
          foto_url?: string | null
          id?: string
          nome_completo?: string
          primeiro_login?: boolean
          senha?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_next_orcamento_number: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
