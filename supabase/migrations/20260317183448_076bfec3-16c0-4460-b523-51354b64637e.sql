-- Add admin_password column to company_settings
ALTER TABLE public.company_settings ADD COLUMN admin_password text DEFAULT '';