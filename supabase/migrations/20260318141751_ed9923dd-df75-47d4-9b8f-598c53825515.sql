
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  codigo_loja text,
  nome_loja text,
  usuario_id uuid REFERENCES public.usuarios(id),
  usuario_nome text NOT NULL,
  usuario_email text,
  usuario_telefone text,
  mensagem text NOT NULL,
  anexos_urls text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'aberto',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on support_tickets" ON public.support_tickets FOR ALL TO public USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public) VALUES ('support-attachments', 'support-attachments', true);
CREATE POLICY "Allow all on support-attachments" ON storage.objects FOR ALL TO public USING (bucket_id = 'support-attachments') WITH CHECK (bucket_id = 'support-attachments');
