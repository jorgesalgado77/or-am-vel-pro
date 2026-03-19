-- Status change history table for kanban pipeline
CREATE TABLE public.client_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status_anterior text,
  status_novo text NOT NULL,
  alterado_por text,
  tenant_id uuid REFERENCES public.tenants(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_status_history_client ON public.client_status_history(client_id);
CREATE INDEX idx_client_status_history_tenant ON public.client_status_history(tenant_id);

ALTER TABLE public.client_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_client_status_history" ON public.client_status_history
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- Trigger to auto-log status changes on clients table
CREATE OR REPLACE FUNCTION public.log_client_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.client_status_history (client_id, status_anterior, status_novo, tenant_id)
    VALUES (NEW.id, OLD.status, NEW.status, NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_client_status_change
  AFTER UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.log_client_status_change();