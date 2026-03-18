

## Plano: Sistema de Suporte

### Resumo
Adicionar botão "Suporte" no menu lateral para todos os usuários, com modal de categorias, formulário com campos auto-preenchidos, upload de anexos e histórico de tickets.

### 1. Banco de Dados
Criar tabela `support_tickets` e bucket de storage:

```sql
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL, -- 'erro', 'sugestao', 'reclamacao'
  codigo_loja text,
  nome_loja text,
  usuario_id uuid REFERENCES public.usuarios(id),
  usuario_nome text NOT NULL,
  usuario_email text,
  usuario_telefone text,
  mensagem text NOT NULL,
  anexos_urls text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'aberto', -- aberto, em_andamento, resolvido
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on support_tickets" ON public.support_tickets FOR ALL TO public USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public) VALUES ('support-attachments', 'support-attachments', true);
CREATE POLICY "Allow all on support-attachments" ON storage.objects FOR ALL TO public USING (bucket_id = 'support-attachments') WITH CHECK (bucket_id = 'support-attachments');
```

### 2. Componentes

**`src/components/SupportDialog.tsx`** (novo):
- Modal inicial com 3 botões: "Reportar Erro ou Problema", "Enviar Sugestão", "Enviar Reclamação"
- Ao selecionar, abre formulário com:
  - Campos superiores auto-preenchidos (read-only): Código da Loja, Nome da Loja (de `company_settings`), Nome do Usuário, Email, Telefone (de `currentUser`)
  - Campo de texto livre para a mensagem
  - Botão de anexar arquivos/imagens (upload para bucket `support-attachments`)
  - Botões "Cancelar" e "Salvar e Enviar"
- Aba/botão "Histórico" para listar tickets anteriores do usuário com status

### 3. Menu Lateral (`AppSidebar.tsx`)
- Adicionar botão "Suporte" (ícone `Headset` ou `LifeBuoy`) abaixo dos itens de navegação, antes da seção do usuário
- Ao clicar, abre o `SupportDialog`
- Visível para todos os usuários (sem filtro de permissão)

### 4. Página Index (`Index.tsx`)
- Adicionar estado `showSupport` e renderizar `<SupportDialog>` quando aberto
- Passar callback `onSupport` para o `AppSidebar`

### Fluxo do Usuário
1. Clica em "Suporte" no menu lateral
2. Escolhe o tipo (Erro, Sugestão, Reclamação)
3. Vê campos pré-preenchidos, digita mensagem, opcionalmente anexa arquivos
4. Clica "Salvar e Enviar" → insere na tabela `support_tickets`
5. Pode acessar "Histórico" para ver tickets anteriores

