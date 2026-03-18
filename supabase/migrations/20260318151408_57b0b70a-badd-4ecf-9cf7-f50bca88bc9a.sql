
CREATE TABLE public.client_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.client_contracts(id) ON DELETE SET NULL,
  numero_contrato text NOT NULL,
  nome_cliente text NOT NULL,
  cpf_cnpj text,
  quantidade_ambientes integer DEFAULT 0,
  valor_contrato numeric DEFAULT 0,
  data_fechamento timestamptz,
  projetista text,
  status text NOT NULL DEFAULT 'medicao',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on client_tracking" ON public.client_tracking FOR ALL TO public USING (true) WITH CHECK (true);

CREATE TABLE public.tracking_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id uuid NOT NULL REFERENCES public.client_tracking(id) ON DELETE CASCADE,
  mensagem text NOT NULL,
  remetente_tipo text NOT NULL DEFAULT 'cliente',
  remetente_nome text,
  lida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tracking_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on tracking_messages" ON public.tracking_messages FOR ALL TO public USING (true) WITH CHECK (true);
