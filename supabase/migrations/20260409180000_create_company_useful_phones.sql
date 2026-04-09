-- Create table for storing company useful phone numbers
CREATE TABLE IF NOT EXISTS public.company_useful_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  setor text NOT NULL DEFAULT '',
  responsavel text NOT NULL DEFAULT '',
  telefone text NOT NULL DEFAULT '',
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.company_useful_phones ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can read own tenant phones"
  ON public.company_useful_phones FOR SELECT
  TO authenticated
  USING (tenant_id = (SELECT (auth.jwt()->'user_metadata'->>'tenant_id')::uuid));

CREATE POLICY "Authenticated users can insert own tenant phones"
  ON public.company_useful_phones FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = (SELECT (auth.jwt()->'user_metadata'->>'tenant_id')::uuid));

CREATE POLICY "Authenticated users can update own tenant phones"
  ON public.company_useful_phones FOR UPDATE
  TO authenticated
  USING (tenant_id = (SELECT (auth.jwt()->'user_metadata'->>'tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT (auth.jwt()->'user_metadata'->>'tenant_id')::uuid));

CREATE POLICY "Authenticated users can delete own tenant phones"
  ON public.company_useful_phones FOR DELETE
  TO authenticated
  USING (tenant_id = (SELECT (auth.jwt()->'user_metadata'->>'tenant_id')::uuid));
