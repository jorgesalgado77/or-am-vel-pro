-- =============================================
-- Adicionar coluna is_default à tabela product_images
-- E adicionar coluna video_url à tabela products (se não existir)
-- Executar manualmente no SQL Editor do banco externo
-- =============================================

ALTER TABLE public.product_images ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;

-- Garantir que apenas uma imagem seja padrão por produto
CREATE OR REPLACE FUNCTION public.ensure_single_default_image()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.product_images 
    SET is_default = false 
    WHERE product_id = NEW.product_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_single_default_image ON public.product_images;
CREATE TRIGGER trg_single_default_image
  BEFORE INSERT OR UPDATE OF is_default ON public.product_images
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION public.ensure_single_default_image();

-- Coluna video_url em products (se não existir)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS video_url TEXT DEFAULT '';
