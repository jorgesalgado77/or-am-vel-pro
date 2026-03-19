
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  preco_mensal numeric NOT NULL DEFAULT 0,
  preco_anual_mensal numeric NOT NULL DEFAULT 0,
  max_usuarios integer NOT NULL DEFAULT 999,
  destaque boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  trial_dias integer NOT NULL DEFAULT 0,
  funcionalidades jsonb NOT NULL DEFAULT '{}'::jsonb,
  features_display jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on subscription_plans" ON public.subscription_plans FOR ALL TO public USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.subscription_plans;

-- Insert existing plans
INSERT INTO public.subscription_plans (slug, nome, descricao, preco_mensal, preco_anual_mensal, max_usuarios, destaque, ordem, trial_dias, funcionalidades, features_display) VALUES
(
  'trial',
  'Teste Grátis',
  'Experimente todas as funcionalidades por 7 dias',
  0, 0, 999, false, 0, 7,
  '{"clientes": true, "simulador": true, "configuracoes": true, "desconto1": true, "desconto2": true, "desconto3": true, "plus": true, "contratos": true, "deal_room": false, "vendazap": false, "suporte_prioritario": false, "dashboard_avancado": true, "indicadores": true, "comissoes": true, "kanban": true}'::jsonb,
  '[{"label": "Acesso completo por 7 dias", "included": true}, {"label": "Clientes ilimitados", "included": true}, {"label": "Simulador de financiamento", "included": true}, {"label": "Desconto 1 e 2", "included": true}, {"label": "Desconto 3 (especial)", "included": true}, {"label": "Plus percentual", "included": true}, {"label": "Contratos digitais", "included": true}, {"label": "Suporte prioritário", "included": false}]'::jsonb
),
(
  'basico',
  'Básico',
  'Ideal para lojas pequenas com até 3 colaboradores',
  59.90, 50.92, 3, false, 1, 0,
  '{"clientes": true, "simulador": true, "configuracoes": true, "desconto1": true, "desconto2": true, "desconto3": false, "plus": false, "contratos": false, "deal_room": true, "vendazap": false, "suporte_prioritario": false, "dashboard_avancado": false, "indicadores": true, "comissoes": true, "kanban": true}'::jsonb,
  '[{"label": "Até 3 usuários", "included": true}, {"label": "Clientes ilimitados", "included": true}, {"label": "Simulador de financiamento", "included": true}, {"label": "Desconto 1 e 2", "included": true}, {"label": "Configurações avançadas", "included": true}, {"label": "Suporte por ticket", "included": true}, {"label": "Desconto 3 (especial)", "included": false}, {"label": "Plus percentual", "included": false}, {"label": "Contratos digitais", "included": false}]'::jsonb
),
(
  'premium',
  'Premium',
  'Para lojas que precisam de tudo, sem limites',
  149.90, 127.42, 999, true, 2, 0,
  '{"clientes": true, "simulador": true, "configuracoes": true, "desconto1": true, "desconto2": true, "desconto3": true, "plus": true, "contratos": true, "deal_room": true, "vendazap": false, "suporte_prioritario": true, "dashboard_avancado": true, "indicadores": true, "comissoes": true, "kanban": true}'::jsonb,
  '[{"label": "Usuários ilimitados", "included": true}, {"label": "Clientes ilimitados", "included": true}, {"label": "Simulador de financiamento", "included": true}, {"label": "Desconto 1, 2 e 3 (especial)", "included": true}, {"label": "Plus percentual", "included": true}, {"label": "Contratos digitais", "included": true}, {"label": "Configurações avançadas", "included": true}, {"label": "Suporte prioritário", "included": true}]'::jsonb
);
