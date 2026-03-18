CREATE TABLE public.whatsapp_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'evolution',
  evolution_api_url text,
  evolution_api_key text,
  evolution_instance_name text,
  twilio_account_sid text,
  twilio_auth_token text,
  twilio_phone_number text,
  ativo boolean NOT NULL DEFAULT false,
  enviar_contrato boolean NOT NULL DEFAULT true,
  enviar_notificacoes boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on whatsapp_settings" ON public.whatsapp_settings FOR ALL TO public USING (true) WITH CHECK (true);

INSERT INTO public.whatsapp_settings (provider) VALUES ('evolution');