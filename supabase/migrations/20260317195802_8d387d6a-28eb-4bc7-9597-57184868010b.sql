CREATE TABLE public.discount_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_name text NOT NULL,
  percentages numeric[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one row per field
ALTER TABLE public.discount_options ADD CONSTRAINT discount_options_field_name_unique UNIQUE (field_name);

-- RLS
ALTER TABLE public.discount_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on discount_options" ON public.discount_options FOR ALL TO public USING (true) WITH CHECK (true);

-- Seed default values
INSERT INTO public.discount_options (field_name, percentages) VALUES
  ('desconto1', ARRAY[0, 5, 10, 15, 20]),
  ('desconto2', ARRAY[0, 5, 10]),
  ('desconto3', ARRAY[0, 5, 10]),
  ('plus', ARRAY[0, 5, 10, 15, 20]);
