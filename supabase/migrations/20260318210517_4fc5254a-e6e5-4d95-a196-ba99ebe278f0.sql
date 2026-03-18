
-- VendaZap AI Add-on tables

-- Addon configuration per tenant
CREATE TABLE public.vendazap_addon (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ativo BOOLEAN NOT NULL DEFAULT false,
  max_mensagens_dia INTEGER NOT NULL DEFAULT 50,
  max_tokens_mensagem INTEGER NOT NULL DEFAULT 300,
  prompt_sistema TEXT NOT NULL DEFAULT 'Você é um assistente de vendas especializado em móveis planejados. Gere mensagens curtas, persuasivas e naturais para WhatsApp. Foco em conversão.',
  tom_padrao TEXT NOT NULL DEFAULT 'persuasivo',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

-- Message history
CREATE TABLE public.vendazap_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  tipo_copy TEXT NOT NULL DEFAULT 'geral',
  tom TEXT NOT NULL DEFAULT 'persuasivo',
  contexto JSONB NOT NULL DEFAULT '{}'::jsonb,
  mensagem_cliente TEXT,
  mensagem_gerada TEXT NOT NULL,
  tokens_usados INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Daily usage tracking
CREATE TABLE public.vendazap_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  mensagens_geradas INTEGER NOT NULL DEFAULT 0,
  tokens_consumidos INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, usuario_id, usage_date)
);

-- RLS
ALTER TABLE public.vendazap_addon ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendazap_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendazap_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on vendazap_addon" ON public.vendazap_addon FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on vendazap_messages" ON public.vendazap_messages FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on vendazap_usage" ON public.vendazap_usage FOR ALL TO public USING (true) WITH CHECK (true);
