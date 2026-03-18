
-- Deal Room daily usage tracking per tenant
CREATE TABLE public.dealroom_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, usuario_id, usage_date, created_at)
);

-- Index for fast daily count lookups
CREATE INDEX idx_dealroom_usage_tenant_date ON public.dealroom_usage(tenant_id, usage_date);

-- Deal Room transactions (completed sales)
CREATE TABLE public.dealroom_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  simulation_id uuid REFERENCES public.simulations(id) ON DELETE SET NULL,
  valor_venda numeric NOT NULL DEFAULT 0,
  taxa_plataforma_percentual numeric NOT NULL DEFAULT 2,
  taxa_plataforma_valor numeric NOT NULL DEFAULT 0,
  forma_pagamento text,
  numero_contrato text,
  nome_cliente text,
  nome_vendedor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dealroom_transactions_tenant ON public.dealroom_transactions(tenant_id, created_at);
CREATE INDEX idx_dealroom_transactions_usuario ON public.dealroom_transactions(usuario_id, created_at);

-- Enable RLS
ALTER TABLE public.dealroom_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dealroom_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Allow all on dealroom_usage" ON public.dealroom_usage FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on dealroom_transactions" ON public.dealroom_transactions FOR ALL TO public USING (true) WITH CHECK (true);

-- Function to count daily usage for a tenant
CREATE OR REPLACE FUNCTION public.get_dealroom_daily_usage(p_tenant_id uuid, p_date date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(COUNT(*)::integer, 0)
  FROM public.dealroom_usage
  WHERE tenant_id = p_tenant_id AND usage_date = p_date;
$$;

-- Function to validate and record deal room usage
CREATE OR REPLACE FUNCTION public.validate_dealroom_access(p_tenant_id uuid, p_usuario_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plano text;
  v_ativo boolean;
  v_daily_count integer;
  v_limit integer;
  v_allowed boolean := false;
  v_recursos_vip jsonb;
BEGIN
  -- Get tenant plan info
  SELECT plano, ativo, recursos_vip INTO v_plano, v_ativo, v_recursos_vip
  FROM public.tenants WHERE id = p_tenant_id;

  IF NOT FOUND OR NOT v_ativo THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Loja inativa ou não encontrada');
  END IF;

  -- Check plan access
  IF v_plano = 'trial' THEN
    -- Check if VIP override exists
    IF v_recursos_vip->>'deal_room' = 'true' THEN
      v_allowed := true;
      v_limit := 999;
    ELSE
      RETURN jsonb_build_object('allowed', false, 'reason', 'Deal Room não disponível no plano gratuito. Faça upgrade para o plano Básico ou Premium.');
    END IF;
  ELSIF v_plano = 'basico' THEN
    v_limit := 1;
    v_daily_count := public.get_dealroom_daily_usage(p_tenant_id);
    IF v_daily_count >= v_limit THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'Limite diário atingido (1 negociação/dia no plano Básico). Faça upgrade para o Premium para uso ilimitado.', 'usage', v_daily_count, 'limit', v_limit);
    END IF;
    v_allowed := true;
  ELSIF v_plano = 'premium' THEN
    v_allowed := true;
    v_limit := 999;
  END IF;

  IF v_allowed THEN
    -- Record usage
    INSERT INTO public.dealroom_usage (tenant_id, usuario_id, usage_date)
    VALUES (p_tenant_id, p_usuario_id, CURRENT_DATE);

    v_daily_count := public.get_dealroom_daily_usage(p_tenant_id);
    RETURN jsonb_build_object('allowed', true, 'usage', v_daily_count, 'limit', v_limit, 'plano', v_plano);
  END IF;

  RETURN jsonb_build_object('allowed', false, 'reason', 'Acesso não permitido');
END;
$$;
