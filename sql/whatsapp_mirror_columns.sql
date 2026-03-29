-- ============================================================
-- ESPELHO WHATSAPP: Colunas adicionais para tracking_messages
-- Execute este SQL no Supabase externo (SQL Editor)
-- ============================================================

-- 1. Coluna de status de entrega (sent → delivered → read)
ALTER TABLE public.tracking_messages
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'sent';

-- 2. ID externo do provedor (Z-API / Evolution / Twilio) para dedup
ALTER TABLE public.tracking_messages
  ADD COLUMN IF NOT EXISTS external_id text;

-- 3. provider_message_id (alias legado mantido para compatibilidade)
ALTER TABLE public.tracking_messages
  ADD COLUMN IF NOT EXISTS provider_message_id text;

-- 4. Índice para dedup por external_id
CREATE INDEX IF NOT EXISTS idx_tracking_messages_external_id
  ON public.tracking_messages (external_id)
  WHERE external_id IS NOT NULL;

-- 5. Índice para dedup por provider_message_id
CREATE INDEX IF NOT EXISTS idx_tracking_messages_provider_msg_id
  ON public.tracking_messages (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- 6. Índice composto para busca rápida de status
CREATE INDEX IF NOT EXISTS idx_tracking_messages_status
  ON public.tracking_messages (tracking_id, status);

-- 7. Grants para roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracking_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracking_messages TO anon;