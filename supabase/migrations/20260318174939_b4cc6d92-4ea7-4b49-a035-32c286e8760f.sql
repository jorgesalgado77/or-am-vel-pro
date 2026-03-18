
CREATE TABLE public.payroll_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  mes_referencia text NOT NULL,
  valor_comissao numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente',
  observacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on payroll_commissions" ON public.payroll_commissions FOR ALL TO public USING (true) WITH CHECK (true);
