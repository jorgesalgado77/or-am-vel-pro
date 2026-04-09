-- Allow "arquivada" status on tasks table
DO $$
DECLARE
  constraint_name text;
BEGIN
  -- Find and drop any existing CHECK constraint on the status column
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_attribute att ON att.attnum = ANY(con.conkey) AND att.attrelid = con.conrelid
  WHERE con.conrelid = 'public.tasks'::regclass
    AND con.contype = 'c'
    AND att.attname = 'status'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.tasks DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- Recreate constraint with arquivada included
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('nova', 'pendente', 'em_execucao', 'concluida', 'arquivada'));
