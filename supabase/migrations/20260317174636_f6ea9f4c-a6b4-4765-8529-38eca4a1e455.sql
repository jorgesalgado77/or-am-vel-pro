
-- Company settings table
CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT 'INOVAMAD',
  company_subtitle text DEFAULT 'Gestão & Financiamento',
  logo_url text,
  budget_validity_days integer NOT NULL DEFAULT 30,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on company_settings" ON public.company_settings FOR ALL USING (true) WITH CHECK (true);

-- Insert default row
INSERT INTO public.company_settings (company_name, company_subtitle) VALUES ('INOVAMAD', 'Gestão & Financiamento');

-- Boleto financing coefficients table
CREATE TABLE public.financing_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name text NOT NULL,
  provider_type text NOT NULL CHECK (provider_type IN ('boleto', 'credito')),
  installments integer NOT NULL,
  coefficient numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(provider_name, provider_type, installments)
);

ALTER TABLE public.financing_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on financing_rates" ON public.financing_rates FOR ALL USING (true) WITH CHECK (true);

-- Insert default credit card rates (Sunup) based on existing hardcoded values
INSERT INTO public.financing_rates (provider_name, provider_type, installments, coefficient) VALUES
  ('Sunup', 'credito', 1, 0.0285),
  ('Sunup', 'credito', 2, 0.039),
  ('Sunup', 'credito', 3, 0.049),
  ('Sunup', 'credito', 4, 0.059),
  ('Sunup', 'credito', 5, 0.069),
  ('Sunup', 'credito', 6, 0.079),
  ('Sunup', 'credito', 7, 0.089),
  ('Sunup', 'credito', 8, 0.099),
  ('Sunup', 'credito', 9, 0.099),
  ('Sunup', 'credito', 10, 0.099),
  ('Sunup', 'credito', 11, 0.099),
  ('Sunup', 'credito', 12, 0.099);

-- Add trigger for updated_at
CREATE TRIGGER update_company_settings_updated_at BEFORE UPDATE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_financing_rates_updated_at BEFORE UPDATE ON public.financing_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for company logos
INSERT INTO storage.buckets (id, name, public) VALUES ('company-assets', 'company-assets', true);
CREATE POLICY "Public read company assets" ON storage.objects FOR SELECT USING (bucket_id = 'company-assets');
CREATE POLICY "Anyone can upload company assets" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'company-assets');
CREATE POLICY "Anyone can update company assets" ON storage.objects FOR UPDATE USING (bucket_id = 'company-assets');
CREATE POLICY "Anyone can delete company assets" ON storage.objects FOR DELETE USING (bucket_id = 'company-assets');
