ALTER TABLE public.client_tracking 
  ADD COLUMN IF NOT EXISTS indicador_id uuid REFERENCES public.indicadores(id),
  ADD COLUMN IF NOT EXISTS indicador_nome text,
  ADD COLUMN IF NOT EXISTS comissao_percentual numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comissao_valor numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comissao_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS comissao_data_pagamento timestamp with time zone;