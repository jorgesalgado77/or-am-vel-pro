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
      audit_logs: {
        Row: {
          acao: string
          created_at: string
          detalhes: Json | null
          entidade: string
          entidade_id: string | null
          id: string
          ip_address: string | null
          tenant_id: string | null
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          detalhes?: Json | null
          entidade: string
          entidade_id?: string | null
          id?: string
          ip_address?: string | null
          tenant_id?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          detalhes?: Json | null
          entidade?: string
          entidade_id?: string | null
          id?: string
          ip_address?: string | null
          tenant_id?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cargos: {
        Row: {
          comissao_percentual: number
          created_at: string
          id: string
          nome: string
          permissoes: Json
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          comissao_percentual?: number
          created_at?: string
          id?: string
          nome: string
          permissoes?: Json
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          comissao_percentual?: number
          created_at?: string
          id?: string
          nome?: string
          permissoes?: Json
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cargos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
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
          {
            foreignKeyName: "client_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tracking: {
        Row: {
          client_id: string
          comissao_data_pagamento: string | null
          comissao_percentual: number | null
          comissao_status: string
          comissao_valor: number | null
          contract_id: string | null
          cpf_cnpj: string | null
          created_at: string
          data_fechamento: string | null
          id: string
          indicador_id: string | null
          indicador_nome: string | null
          nome_cliente: string
          numero_contrato: string
          projetista: string | null
          quantidade_ambientes: number | null
          status: string
          tenant_id: string | null
          updated_at: string
          valor_contrato: number | null
        }
        Insert: {
          client_id: string
          comissao_data_pagamento?: string | null
          comissao_percentual?: number | null
          comissao_status?: string
          comissao_valor?: number | null
          contract_id?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          data_fechamento?: string | null
          id?: string
          indicador_id?: string | null
          indicador_nome?: string | null
          nome_cliente: string
          numero_contrato: string
          projetista?: string | null
          quantidade_ambientes?: number | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          valor_contrato?: number | null
        }
        Update: {
          client_id?: string
          comissao_data_pagamento?: string | null
          comissao_percentual?: number | null
          comissao_status?: string
          comissao_valor?: number | null
          contract_id?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          data_fechamento?: string | null
          id?: string
          indicador_id?: string | null
          indicador_nome?: string | null
          nome_cliente?: string
          numero_contrato?: string
          projetista?: string | null
          quantidade_ambientes?: number | null
          status?: string
          tenant_id?: string | null
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
          {
            foreignKeyName: "client_tracking_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "indicadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tracking_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          status: string
          telefone1: string | null
          telefone2: string | null
          tenant_id: string | null
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
          status?: string
          telefone1?: string | null
          telefone2?: string | null
          tenant_id?: string | null
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
          status?: string
          telefone1?: string | null
          telefone2?: string | null
          tenant_id?: string | null
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
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          admin_password: string | null
          bairro_loja: string | null
          budget_validity_days: number
          cep_loja: string | null
          cidade_loja: string | null
          cnpj_loja: string | null
          codigo_loja: string | null
          company_name: string
          company_subtitle: string | null
          created_at: string
          email_loja: string | null
          endereco_loja: string | null
          id: string
          logo_url: string | null
          manager_password: string | null
          orcamento_numero_inicial: number
          telefone_loja: string | null
          tenant_id: string | null
          uf_loja: string | null
          updated_at: string
        }
        Insert: {
          admin_password?: string | null
          bairro_loja?: string | null
          budget_validity_days?: number
          cep_loja?: string | null
          cidade_loja?: string | null
          cnpj_loja?: string | null
          codigo_loja?: string | null
          company_name?: string
          company_subtitle?: string | null
          created_at?: string
          email_loja?: string | null
          endereco_loja?: string | null
          id?: string
          logo_url?: string | null
          manager_password?: string | null
          orcamento_numero_inicial?: number
          telefone_loja?: string | null
          tenant_id?: string | null
          uf_loja?: string | null
          updated_at?: string
        }
        Update: {
          admin_password?: string | null
          bairro_loja?: string | null
          budget_validity_days?: number
          cep_loja?: string | null
          cidade_loja?: string | null
          cnpj_loja?: string | null
          codigo_loja?: string | null
          company_name?: string
          company_subtitle?: string | null
          created_at?: string
          email_loja?: string | null
          endereco_loja?: string | null
          id?: string
          logo_url?: string | null
          manager_password?: string | null
          orcamento_numero_inicial?: number
          telefone_loja?: string | null
          tenant_id?: string | null
          uf_loja?: string | null
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dealroom_transactions: {
        Row: {
          client_id: string | null
          created_at: string
          forma_pagamento: string | null
          id: string
          nome_cliente: string | null
          nome_vendedor: string | null
          numero_contrato: string | null
          simulation_id: string | null
          taxa_plataforma_percentual: number
          taxa_plataforma_valor: number
          tenant_id: string
          updated_at: string
          usuario_id: string | null
          valor_venda: number
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          forma_pagamento?: string | null
          id?: string
          nome_cliente?: string | null
          nome_vendedor?: string | null
          numero_contrato?: string | null
          simulation_id?: string | null
          taxa_plataforma_percentual?: number
          taxa_plataforma_valor?: number
          tenant_id: string
          updated_at?: string
          usuario_id?: string | null
          valor_venda?: number
        }
        Update: {
          client_id?: string | null
          created_at?: string
          forma_pagamento?: string | null
          id?: string
          nome_cliente?: string | null
          nome_vendedor?: string | null
          numero_contrato?: string | null
          simulation_id?: string | null
          taxa_plataforma_percentual?: number
          taxa_plataforma_valor?: number
          tenant_id?: string
          updated_at?: string
          usuario_id?: string | null
          valor_venda?: number
        }
        Relationships: [
          {
            foreignKeyName: "dealroom_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealroom_transactions_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "simulations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealroom_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealroom_transactions_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      dealroom_usage: {
        Row: {
          created_at: string
          id: string
          tenant_id: string
          usage_date: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          tenant_id: string
          usage_date?: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          tenant_id?: string
          usage_date?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dealroom_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealroom_usage_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_options: {
        Row: {
          created_at: string
          field_name: string
          id: string
          percentages: number[]
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_name: string
          id?: string
          percentages?: number[]
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_name?: string
          id?: string
          percentages?: number[]
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_options_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financing_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "indicadores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_page_config: {
        Row: {
          benefits: Json
          carousel_images: Json
          created_at: string
          cta_final_text: string
          footer_contact_email: string | null
          footer_contact_phone: string | null
          footer_text: string
          hero_image_url: string | null
          hero_subtitle: string
          hero_title: string
          hero_video_url: string | null
          how_it_works: Json
          id: string
          plans: Json
          primary_color: string
          proof_text: string
          secondary_color: string
          sections_visible: Json
          updated_at: string
        }
        Insert: {
          benefits?: Json
          carousel_images?: Json
          created_at?: string
          cta_final_text?: string
          footer_contact_email?: string | null
          footer_contact_phone?: string | null
          footer_text?: string
          hero_image_url?: string | null
          hero_subtitle?: string
          hero_title?: string
          hero_video_url?: string | null
          how_it_works?: Json
          id?: string
          plans?: Json
          primary_color?: string
          proof_text?: string
          secondary_color?: string
          sections_visible?: Json
          updated_at?: string
        }
        Update: {
          benefits?: Json
          carousel_images?: Json
          created_at?: string
          cta_final_text?: string
          footer_contact_email?: string | null
          footer_contact_phone?: string | null
          footer_text?: string
          hero_image_url?: string | null
          hero_subtitle?: string
          hero_title?: string
          hero_video_url?: string | null
          how_it_works?: Json
          id?: string
          plans?: Json
          primary_color?: string
          proof_text?: string
          secondary_color?: string
          sections_visible?: Json
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          area_atuacao: string
          cargo: string
          created_at: string
          email: string
          id: string
          nome: string
          notas: string | null
          status: string
          telefone: string
          updated_at: string
        }
        Insert: {
          area_atuacao: string
          cargo: string
          created_at?: string
          email: string
          id?: string
          nome: string
          notas?: string | null
          status?: string
          telefone: string
          updated_at?: string
        }
        Update: {
          area_atuacao?: string
          cargo?: string
          created_at?: string
          email?: string
          id?: string
          nome?: string
          notas?: string | null
          status?: string
          telefone?: string
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
      payroll_commissions: {
        Row: {
          cargo_referencia: string | null
          client_name: string | null
          contrato_numero: string | null
          created_at: string
          id: string
          indicador_id: string | null
          mes_referencia: string
          observacao: string | null
          status: string
          tenant_id: string | null
          updated_at: string
          usuario_id: string | null
          valor_base: number
          valor_comissao: number
        }
        Insert: {
          cargo_referencia?: string | null
          client_name?: string | null
          contrato_numero?: string | null
          created_at?: string
          id?: string
          indicador_id?: string | null
          mes_referencia: string
          observacao?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          usuario_id?: string | null
          valor_base?: number
          valor_comissao?: number
        }
        Update: {
          cargo_referencia?: string | null
          client_name?: string | null
          contrato_numero?: string | null
          created_at?: string
          id?: string
          indicador_id?: string | null
          mes_referencia?: string
          observacao?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          usuario_id?: string | null
          valor_base?: number
          valor_comissao?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_commissions_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "indicadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_commissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_commissions_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
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
          {
            foreignKeyName: "simulations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string
          destaque: boolean
          features_display: Json
          funcionalidades: Json
          id: string
          max_usuarios: number
          nome: string
          ordem: number
          preco_anual_mensal: number
          preco_mensal: number
          slug: string
          trial_dias: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string
          destaque?: boolean
          features_display?: Json
          funcionalidades?: Json
          id?: string
          max_usuarios?: number
          nome: string
          ordem?: number
          preco_anual_mensal?: number
          preco_mensal?: number
          slug: string
          trial_dias?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string
          destaque?: boolean
          features_display?: Json
          funcionalidades?: Json
          id?: string
          max_usuarios?: number
          nome?: string
          ordem?: number
          preco_anual_mensal?: number
          preco_mensal?: number
          slug?: string
          trial_dias?: number
          updated_at?: string
        }
        Relationships: []
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          tipo?: string
          updated_at?: string
          usuario_email?: string | null
          usuario_id?: string | null
          usuario_nome?: string
          usuario_telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
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
          tenant_id: string | null
          tracking_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lida?: boolean
          mensagem: string
          remetente_nome?: string | null
          remetente_tipo?: string
          tenant_id?: string | null
          tracking_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lida?: boolean
          mensagem?: string
          remetente_nome?: string | null
          remetente_tipo?: string
          tenant_id?: string | null
          tracking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
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
          auth_user_id: string | null
          cargo_id: string | null
          comissao_percentual: number | null
          created_at: string
          email: string | null
          foto_url: string | null
          id: string
          nome_completo: string
          primeiro_login: boolean
          salario_fixo: number | null
          senha: string | null
          telefone: string | null
          tenant_id: string | null
          tipo_regime: string | null
          updated_at: string
        }
        Insert: {
          apelido?: string | null
          ativo?: boolean
          auth_user_id?: string | null
          cargo_id?: string | null
          comissao_percentual?: number | null
          created_at?: string
          email?: string | null
          foto_url?: string | null
          id?: string
          nome_completo: string
          primeiro_login?: boolean
          salario_fixo?: number | null
          senha?: string | null
          telefone?: string | null
          tenant_id?: string | null
          tipo_regime?: string | null
          updated_at?: string
        }
        Update: {
          apelido?: string | null
          ativo?: boolean
          auth_user_id?: string | null
          cargo_id?: string | null
          comissao_percentual?: number | null
          created_at?: string
          email?: string | null
          foto_url?: string | null
          id?: string
          nome_completo?: string
          primeiro_login?: boolean
          salario_fixo?: number | null
          senha?: string | null
          telefone?: string | null
          tenant_id?: string | null
          tipo_regime?: string | null
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
          {
            foreignKeyName: "usuarios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vendazap_addon: {
        Row: {
          api_provider: string
          ativo: boolean
          created_at: string
          id: string
          max_mensagens_dia: number
          max_tokens_mensagem: number
          openai_model: string
          prompt_sistema: string
          tenant_id: string
          tom_padrao: string
          updated_at: string
        }
        Insert: {
          api_provider?: string
          ativo?: boolean
          created_at?: string
          id?: string
          max_mensagens_dia?: number
          max_tokens_mensagem?: number
          openai_model?: string
          prompt_sistema?: string
          tenant_id: string
          tom_padrao?: string
          updated_at?: string
        }
        Update: {
          api_provider?: string
          ativo?: boolean
          created_at?: string
          id?: string
          max_mensagens_dia?: number
          max_tokens_mensagem?: number
          openai_model?: string
          prompt_sistema?: string
          tenant_id?: string
          tom_padrao?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendazap_addon_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vendazap_messages: {
        Row: {
          client_id: string | null
          contexto: Json
          created_at: string
          id: string
          mensagem_cliente: string | null
          mensagem_gerada: string
          tenant_id: string
          tipo_copy: string
          tokens_usados: number
          tom: string
          usuario_id: string | null
        }
        Insert: {
          client_id?: string | null
          contexto?: Json
          created_at?: string
          id?: string
          mensagem_cliente?: string | null
          mensagem_gerada: string
          tenant_id: string
          tipo_copy?: string
          tokens_usados?: number
          tom?: string
          usuario_id?: string | null
        }
        Update: {
          client_id?: string | null
          contexto?: Json
          created_at?: string
          id?: string
          mensagem_cliente?: string | null
          mensagem_gerada?: string
          tenant_id?: string
          tipo_copy?: string
          tokens_usados?: number
          tom?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendazap_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendazap_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendazap_messages_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      vendazap_usage: {
        Row: {
          created_at: string
          id: string
          mensagens_geradas: number
          tenant_id: string
          tokens_consumidos: number
          usage_date: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mensagens_geradas?: number
          tenant_id: string
          tokens_consumidos?: number
          usage_date?: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mensagens_geradas?: number
          tenant_id?: string
          tokens_consumidos?: number
          usage_date?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendazap_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendazap_usage_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          twilio_account_sid?: string | null
          twilio_auth_token?: string | null
          twilio_phone_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_dealroom_daily_usage: {
        Args: { p_date?: string; p_tenant_id: string }
        Returns: number
      }
      get_next_orcamento_number: { Args: never; Returns: string }
      get_user_tenant_id: { Args: { p_auth_user_id: string }; Returns: string }
      hash_password: { Args: { plain_text: string }; Returns: string }
      validate_dealroom_access: {
        Args: { p_tenant_id: string; p_usuario_id?: string }
        Returns: Json
      }
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
