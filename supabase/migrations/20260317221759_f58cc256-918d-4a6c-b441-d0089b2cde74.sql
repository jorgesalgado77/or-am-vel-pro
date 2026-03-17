
CREATE TABLE public.contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL DEFAULT 'Contrato Padrão',
  conteudo_html text NOT NULL DEFAULT '',
  arquivo_original_url text,
  arquivo_original_nome text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on contract_templates" ON public.contract_templates
  FOR ALL TO public USING (true) WITH CHECK (true);

CREATE TABLE public.client_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  simulation_id uuid REFERENCES public.simulations(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.contract_templates(id) ON DELETE SET NULL,
  conteudo_html text NOT NULL DEFAULT '',
  pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on client_contracts" ON public.client_contracts
  FOR ALL TO public USING (true) WITH CHECK (true);
