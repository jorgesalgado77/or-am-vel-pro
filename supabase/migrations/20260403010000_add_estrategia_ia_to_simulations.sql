-- Add estrategia_ia column to simulations table
ALTER TABLE public.simulations ADD COLUMN IF NOT EXISTS estrategia_ia text;
