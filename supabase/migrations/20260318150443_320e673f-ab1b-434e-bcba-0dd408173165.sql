ALTER TABLE public.support_tickets 
ADD COLUMN IF NOT EXISTS resposta_admin text,
ADD COLUMN IF NOT EXISTS respondido_em timestamp with time zone,
ADD COLUMN IF NOT EXISTS respondido_por text;