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
      admin_master: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string
          senha: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          nome?: string
          senha: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
          senha?: string
          updated_at?: string
        }
        Relationships: []
      }
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
      client_tracking: {
        Row: {
          client_id: string
          contract_id: string | null
          cpf_cnpj: string | null
          created_at: string
          data_fechamento: string | null
          id: string
          nome_cliente: string
          numero_contrato: string
          projetista: string | null
          quantidade_ambientes: number | null
          status: string
          updated_at: string
          valor_contrato: number | null
        }
        Insert: {
          client_id: string
          contract_id?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          data_fechamento?: string | null
          id?: string
          nome_cliente: string
          numero_contrato: string
          projetista?: string | null
          quantidade_ambientes?: number | null
          status?: string
          updated_at?: string
          valor_contrato?: number | null
        }
        Update: {
          client_id?: string
          contract_id?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          data_fechamento?: string | null
          id?: string
          nome_cliente?: string
          numero_contrato?: string
          projetista?: string | null
          quantidade_ambientes?: number | null
          status?: string
          updated_at?: string
          valor_contrato?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_tracking_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tracking_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "client_contracts"
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      payment_settings: {
        Row: {
          api_key_public: string | null
          api_key_secret: string | null
          ativo: boolean
          configuracoes: Json | null
          created_at: string
          gateway_name: string
          id: string
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          api_key_public?: string | null
          api_key_secret?: string | null
          ativo?: boolean
          configuracoes?: Json | null
          created_at?: string
          gateway_name: string
          id?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          api_key_public?: string | null
          api_key_secret?: string | null
          ativo?: boolean
          configuracoes?: Json | null
          created_at?: string
          gateway_name?: string
          id?: string
          updated_at?: string
          webhook_url?: string | null
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
      support_tickets: {
        Row: {
          anexos_urls: string[] | null
          codigo_loja: string | null
          created_at: string
          id: string
          mensagem: string
          nome_loja: string | null
          respondido_em: string | null
          respondido_por: string | null
          resposta_admin: string | null
          status: string
          tipo: string
          updated_at: string
          usuario_email: string | null
          usuario_id: string | null
          usuario_nome: string
          usuario_telefone: string | null
        }
        Insert: {
          anexos_urls?: string[] | null
          codigo_loja?: string | null
          created_at?: string
          id?: string
          mensagem: string
          nome_loja?: string | null
          respondido_em?: string | null
          respondido_por?: string | null
          resposta_admin?: string | null
          status?: string
          tipo: string
          updated_at?: string
          usuario_email?: string | null
          usuario_id?: string | null
          usuario_nome: string
          usuario_telefone?: string | null
        }
        Update: {
          anexos_urls?: string[] | null
          codigo_loja?: string | null
          created_at?: string
          id?: string
          mensagem?: string
          nome_loja?: string | null
          respondido_em?: string | null
          respondido_por?: string | null
          resposta_admin?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          usuario_email?: string | null
          usuario_id?: string | null
          usuario_nome?: string
          usuario_telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          assinatura_fim: string | null
          assinatura_inicio: string | null
          ativo: boolean
          codigo_loja: string | null
          created_at: string
          email_contato: string | null
          id: string
          max_usuarios: number
          nome_loja: string
          plano: string
          plano_periodo: string
          recursos_vip: Json
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          telefone_contato: string | null
          trial_fim: string
          trial_inicio: string
          updated_at: string
        }
        Insert: {
          assinatura_fim?: string | null
          assinatura_inicio?: string | null
          ativo?: boolean
          codigo_loja?: string | null
          created_at?: string
          email_contato?: string | null
          id?: string
          max_usuarios?: number
          nome_loja: string
          plano?: string
          plano_periodo?: string
          recursos_vip?: Json
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          telefone_contato?: string | null
          trial_fim?: string
          trial_inicio?: string
          updated_at?: string
        }
        Update: {
          assinatura_fim?: string | null
          assinatura_inicio?: string | null
          ativo?: boolean
          codigo_loja?: string | null
          created_at?: string
          email_contato?: string | null
          id?: string
          max_usuarios?: number
          nome_loja?: string
          plano?: string
          plano_periodo?: string
          recursos_vip?: Json
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          telefone_contato?: string | null
          trial_fim?: string
          trial_inicio?: string
          updated_at?: string
        }
        Relationships: []
      }
      tracking_messages: {
        Row: {
          created_at: string
          id: string
          lida: boolean
          mensagem: string
          remetente_nome: string | null
          remetente_tipo: string
          tracking_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lida?: boolean
          mensagem: string
          remetente_nome?: string | null
          remetente_tipo?: string
          tracking_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lida?: boolean
          mensagem?: string
          remetente_nome?: string | null
          remetente_tipo?: string
          tracking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_messages_tracking_id_fkey"
            columns: ["tracking_id"]
            isOneToOne: false
            referencedRelation: "client_tracking"
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
      whatsapp_settings: {
        Row: {
          ativo: boolean
          created_at: string
          enviar_contrato: boolean
          enviar_notificacoes: boolean
          evolution_api_key: string | null
          evolution_api_url: string | null
          evolution_instance_name: string | null
          id: string
          provider: string
          twilio_account_sid: string | null
          twilio_auth_token: string | null
          twilio_phone_number: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          enviar_contrato?: boolean
          enviar_notificacoes?: boolean
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          evolution_instance_name?: string | null
          id?: string
          provider?: string
          twilio_account_sid?: string | null
          twilio_auth_token?: string | null
          twilio_phone_number?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          enviar_contrato?: boolean
          enviar_notificacoes?: boolean
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          evolution_instance_name?: string | null
          id?: string
          provider?: string
          twilio_account_sid?: string | null
          twilio_auth_token?: string | null
          twilio_phone_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_next_orcamento_number: { Args: never; Returns: string }
      hash_password: { Args: { plain_text: string }; Returns: string }
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
