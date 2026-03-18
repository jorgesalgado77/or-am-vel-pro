
-- Landing page configuration table (single row, JSON-based for flexibility)
CREATE TABLE public.landing_page_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hero_title text NOT NULL DEFAULT 'Orçamentos rápidos. Vendas fechadas. Sem complicação.',
  hero_subtitle text NOT NULL DEFAULT 'O sistema completo para marcenarias e lojas de móveis planejados venderem mais, com organização e controle total.',
  hero_image_url text DEFAULT NULL,
  hero_video_url text DEFAULT NULL,
  benefits jsonb NOT NULL DEFAULT '[
    {"icon":"Calculator","title":"Criação rápida de orçamentos","description":"Monte orçamentos profissionais em poucos minutos com cálculos automáticos."},
    {"icon":"Handshake","title":"Controle total de negociações","description":"Acompanhe cada etapa do processo comercial com visão completa."},
    {"icon":"CreditCard","title":"Simulação de pagamento","description":"Simule financiamentos e condições de pagamento em tempo real."},
    {"icon":"FileText","title":"Geração automática de contratos","description":"Contratos prontos com preenchimento automático de dados."},
    {"icon":"Users","title":"Controle de comissões e equipe","description":"Gerencie sua equipe, cargos e comissões de forma centralizada."},
    {"icon":"LayoutDashboard","title":"Tudo em um só lugar","description":"Dashboard completo com KPIs, relatórios e gestão integrada."}
  ]'::jsonb,
  carousel_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  how_it_works jsonb NOT NULL DEFAULT '[
    {"step":1,"title":"Crie seu orçamento em minutos","description":"Cadastre o cliente, escolha os itens e gere um orçamento profissional."},
    {"step":2,"title":"Negocie e feche com facilidade","description":"Simule condições de pagamento e apresente propostas irrecusíveis."},
    {"step":3,"title":"Gere contratos e controle sua operação","description":"Automatize contratos, acompanhe entregas e gerencie comissões."}
  ]'::jsonb,
  proof_text text NOT NULL DEFAULT 'Pare de perder vendas por falta de organização. Tenha controle total do seu processo comercial e aumente seu faturamento.',
  plans jsonb NOT NULL DEFAULT '[
    {"name":"Básico","price_monthly":97,"price_yearly":82,"max_users":3,"features":["Até 3 usuários","Simulador de orçamentos","Gestão de clientes","Suporte por email"],"recommended":false},
    {"name":"Profissional","price_monthly":197,"price_yearly":167,"max_users":10,"features":["Até 10 usuários","Tudo do Básico","Contratos automáticos","Comissões e folha","Suporte prioritário"],"recommended":true},
    {"name":"Premium","price_monthly":347,"price_yearly":295,"max_users":999,"features":["Usuários ilimitados","Tudo do Profissional","Dashboard avançado","Indicadores e relatórios","Suporte VIP dedicado"],"recommended":false}
  ]'::jsonb,
  cta_final_text text NOT NULL DEFAULT 'Comece agora e transforme suas vendas',
  primary_color text NOT NULL DEFAULT '#1e40af',
  secondary_color text NOT NULL DEFAULT '#0ea5e9',
  sections_visible jsonb NOT NULL DEFAULT '{"hero":true,"benefits":true,"carousel":true,"how_it_works":true,"proof":true,"plans":true,"lead_form":true,"cta_final":true}'::jsonb,
  footer_text text NOT NULL DEFAULT 'Todos os direitos reservados',
  footer_contact_email text DEFAULT 'contato@orcamovel.com.br',
  footer_contact_phone text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Leads table
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  area_atuacao text NOT NULL,
  cargo text NOT NULL,
  telefone text NOT NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'novo',
  notas text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.landing_page_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on landing_page_config" ON public.landing_page_config FOR SELECT TO public USING (true);
CREATE POLICY "Allow all on landing_page_config for authenticated" ON public.landing_page_config FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow insert on leads" ON public.leads FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow all on leads for admin" ON public.leads FOR ALL TO public USING (true) WITH CHECK (true);

-- Insert default config row
INSERT INTO public.landing_page_config (id) VALUES (gen_random_uuid());
