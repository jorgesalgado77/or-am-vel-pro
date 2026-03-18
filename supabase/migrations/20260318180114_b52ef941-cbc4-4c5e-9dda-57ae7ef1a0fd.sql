
ALTER TABLE public.cargos ADD COLUMN comissao_percentual numeric NOT NULL DEFAULT 0;

ALTER TABLE public.payroll_commissions 
  ADD COLUMN cargo_referencia text,
  ADD COLUMN contrato_numero text,
  ADD COLUMN valor_base numeric NOT NULL DEFAULT 0,
  ADD COLUMN client_name text,
  ALTER COLUMN usuario_id DROP NOT NULL;

ALTER TABLE public.payroll_commissions 
  ADD COLUMN indicador_id uuid REFERENCES public.indicadores(id) ON DELETE SET NULL;
