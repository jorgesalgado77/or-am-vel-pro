
CREATE TABLE public.indicadores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  comissao_percentual numeric NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.indicadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on indicadores" ON public.indicadores FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE public.clients ADD COLUMN indicador_id uuid REFERENCES public.indicadores(id) DEFAULT NULL;
