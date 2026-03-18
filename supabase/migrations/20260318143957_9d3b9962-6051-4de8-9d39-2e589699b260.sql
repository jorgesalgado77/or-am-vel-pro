
-- Tabela de admin master do sistema
CREATE TABLE public.admin_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  senha text NOT NULL,
  nome text NOT NULL DEFAULT 'Administrador',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on admin_master" ON public.admin_master FOR ALL TO public USING (true) WITH CHECK (true);

-- Tabela de tenants (lojas)
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_loja text NOT NULL,
  codigo_loja text UNIQUE,
  email_contato text,
  telefone_contato text,
  plano text NOT NULL DEFAULT 'trial', -- trial, basico, premium
  plano_periodo text NOT NULL DEFAULT 'mensal', -- mensal, anual
  trial_inicio timestamptz NOT NULL DEFAULT now(),
  trial_fim timestamptz NOT NULL DEFAULT now() + interval '7 days',
  assinatura_inicio timestamptz,
  assinatura_fim timestamptz,
  max_usuarios integer NOT NULL DEFAULT 999,
  ativo boolean NOT NULL DEFAULT true,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on tenants" ON public.tenants FOR ALL TO public USING (true) WITH CHECK (true);

-- Tabela de configurações de pagamento
CREATE TABLE public.payment_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_name text NOT NULL, -- stripe, mercado_pago, pagseguro
  api_key_public text,
  api_key_secret text,
  webhook_url text,
  ativo boolean NOT NULL DEFAULT false,
  configuracoes jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on payment_settings" ON public.payment_settings FOR ALL TO public USING (true) WITH CHECK (true);

-- Inserir admin master padrão
INSERT INTO public.admin_master (email, senha, nome) VALUES ('admin@sistema.com', 'admin123', 'Administrador Master');
