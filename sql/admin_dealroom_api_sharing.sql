-- =====================================================
-- Deal Room: configurações de APIs do admin master
-- e compartilhamento programado por loja
-- =====================================================

CREATE TABLE IF NOT EXISTS public.dealroom_api_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  nome text NOT NULL,
  categoria text NOT NULL,
  credenciais jsonb NOT NULL DEFAULT '{}'::jsonb,
  configuracoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  created_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dealroom_api_configs_provider_key
  ON public.dealroom_api_configs (provider);

CREATE TABLE IF NOT EXISTS public.dealroom_api_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.dealroom_api_configs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  shared_by text NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dealroom_api_shares_unique UNIQUE (config_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS dealroom_api_shares_tenant_idx
  ON public.dealroom_api_shares (tenant_id, is_active, ends_at);

CREATE INDEX IF NOT EXISTS dealroom_api_shares_config_idx
  ON public.dealroom_api_shares (config_id, is_active, ends_at);

ALTER TABLE public.dealroom_api_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dealroom_api_shares ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dealroom_api_configs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dealroom_api_shares TO authenticated;

DROP POLICY IF EXISTS "Admin master gerencia dealroom_api_configs" ON public.dealroom_api_configs;
CREATE POLICY "Admin master gerencia dealroom_api_configs"
ON public.dealroom_api_configs
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_master am
    WHERE lower(am.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.admin_master am
    WHERE lower(am.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  )
);

DROP POLICY IF EXISTS "Admin master gerencia dealroom_api_shares" ON public.dealroom_api_shares;
CREATE POLICY "Admin master gerencia dealroom_api_shares"
ON public.dealroom_api_shares
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_master am
    WHERE lower(am.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.admin_master am
    WHERE lower(am.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  )
);

DROP VIEW IF EXISTS public.dealroom_api_share_status;
CREATE VIEW public.dealroom_api_share_status
WITH (security_invoker = on) AS
SELECT
  s.id,
  s.tenant_id,
  s.config_id,
  c.provider,
  c.nome,
  c.categoria,
  s.starts_at,
  s.ends_at,
  s.is_active,
  c.is_active AS config_active,
  (s.is_active AND c.is_active AND now() BETWEEN s.starts_at AND s.ends_at) AS available,
  s.shared_by,
  s.notes,
  s.created_at,
  s.updated_at
FROM public.dealroom_api_shares s
JOIN public.dealroom_api_configs c ON c.id = s.config_id;

GRANT SELECT ON public.dealroom_api_share_status TO authenticated;

INSERT INTO public.dealroom_api_configs (provider, nome, categoria, created_by, updated_at)
VALUES
  ('jitsi', 'Jitsi Meet', 'video', 'seed', now()),
  ('daily', 'Daily.co', 'video', 'seed', now()),
  ('twilio_video', 'Twilio Video', 'video', 'seed', now()),
  ('livekit', 'LiveKit', 'video', 'seed', now()),
  ('stripe', 'Stripe', 'pagamento', 'seed', now()),
  ('openai', 'OpenAI', 'ia', 'seed', now()),
  ('govbr_signature', 'Gov.br / ICP-Brasil', 'assinatura', 'seed', now())
ON CONFLICT (provider) DO UPDATE
SET nome = EXCLUDED.nome,
    categoria = EXCLUDED.categoria,
    updated_at = now();