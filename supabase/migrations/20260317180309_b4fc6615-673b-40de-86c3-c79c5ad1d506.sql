
-- Cargos (company roles with access levels)
CREATE TABLE public.cargos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  permissoes jsonb NOT NULL DEFAULT '{
    "clientes": true,
    "simulador": true,
    "configuracoes": false,
    "desconto1": true,
    "desconto2": true,
    "desconto3": false,
    "plus": false
  }'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cargos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on cargos" ON public.cargos FOR ALL TO public USING (true) WITH CHECK (true);

-- Usuarios (company employees)
CREATE TABLE public.usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_completo text NOT NULL,
  apelido text,
  telefone text,
  email text,
  cargo_id uuid REFERENCES public.cargos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on usuarios" ON public.usuarios FOR ALL TO public USING (true) WITH CHECK (true);
