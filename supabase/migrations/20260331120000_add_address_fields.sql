-- Add address fields to clients table for KM calculation
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS estado text,
  ADD COLUMN IF NOT EXISTS cep text;

-- Add address fields to usuarios table for KM calculation
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS estado text,
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS uf text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS complemento text,
  ADD COLUMN IF NOT EXISTS telefone_whatsapp text,
  ADD COLUMN IF NOT EXISTS data_nascimento date,
  ADD COLUMN IF NOT EXISTS facebook text,
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS tiktok text,
  ADD COLUMN IF NOT EXISTS linkedin text;

-- Add round_trip_km to measurement_schedule_history
ALTER TABLE public.measurement_schedule_history
  ADD COLUMN IF NOT EXISTS round_trip_km numeric;
