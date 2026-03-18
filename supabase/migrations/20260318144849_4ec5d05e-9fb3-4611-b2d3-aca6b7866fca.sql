
-- Adicionar tenant_id ao company_settings
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;

-- Criar função para hash de senha simples (SHA-256) 
CREATE OR REPLACE FUNCTION public.hash_password(plain_text text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN encode(digest(plain_text, 'sha256'), 'hex');
END;
$$;

-- Atualizar senha do admin master para hash
UPDATE public.admin_master SET senha = encode(digest('admin123', 'sha256'), 'hex') WHERE email = 'admin@sistema.com';
