-- Add ativo column to usuarios
ALTER TABLE public.usuarios ADD COLUMN ativo boolean NOT NULL DEFAULT true;