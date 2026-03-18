ALTER TABLE public.vendazap_addon
ADD COLUMN IF NOT EXISTS api_provider TEXT NOT NULL DEFAULT 'openai',
ADD COLUMN IF NOT EXISTS openai_model TEXT NOT NULL DEFAULT 'gpt-5-mini';