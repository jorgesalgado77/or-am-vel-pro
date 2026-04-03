

## Plano: Fluxo Completo de Fechamento de Contrato + Portal do Cliente

### Problema Atual
O botão "Salvar Contrato e Continuar" no `CloseSaleModal` chama `handleCloseSaleConfirm`, que salva a simulação e abre o `ContractEditorDialog`. Porém, o `ContractEditorDialog` atual tem apenas botões "Cancelar" e "Salvar e Imprimir" — faltam opções de PDF, envio ao cliente e o portal público. Além disso, o `handleContractConfirm` salva o contrato e imediatamente abre janela de impressão sem dar controle ao usuário.

### Arquitetura do Fluxo Proposto

```text
CloseSaleModal (dados do contrato)
  └─► "Salvar Contrato e Continuar"
        └─► Salva simulação + gera HTML do contrato
              └─► ContractEditorDialog (REFORMULADO)
                    ├─ Preview do contrato (iframe)
                    ├─ Modo edição (contentEditable)
                    └─ Barra de ações:
                         ├─ Imprimir
                         ├─ Salvar como PDF
                         ├─ Enviar à Área do Cliente (gera link público)
                         └─ Salvar Contrato (persiste no banco)

Link público → /contrato/:token
  └─► ClientContractPortal (página pública)
        ├─ Preview do contrato (iframe)
        ├─ Botão Imprimir
        ├─ Botão Baixar PDF
        ├─ Assinatura Digital (canvas)
        ├─ Upload de selfie + documento
        ├─ Assinar via Gov.br (link externo)
        └─ Botão "Confirmar e Enviar"
```

### Tarefas de Implementação

#### 1. Migração de Schema (nova tabela + coluna)
- Adicionar colunas à tabela `client_contracts`:
  - `public_token` (text, unique) — token UUID para acesso público
  - `status` (text, default 'rascunho') — rascunho | enviado | assinado
  - `assinatura_url` (text, nullable) — URL da imagem de assinatura
  - `selfie_url` (text, nullable) — URL da selfie
  - `documento_url` (text, nullable) — URL da foto do documento
  - `assinado_em` (timestamptz, nullable)
  - `assinado_via` (text, nullable) — 'manual' | 'govbr'
- Criar política RLS para acesso público via token (sem auth)

#### 2. Reformular o `ContractEditorDialog`
- Manter preview e edição como estão
- Substituir footer com barra de ações completa:
  - **Salvar Contrato**: persiste no banco (insert/update `client_contracts`)
  - **Imprimir**: abre janela de impressão via `openContractPrintWindow`
  - **Baixar PDF**: gera PDF server-side e baixa
  - **Enviar à Área do Cliente**: gera `public_token`, salva contrato, copia link para clipboard e mostra toast com URL
- Após salvar, manter dialog aberto (não fechar automaticamente)

#### 3. Criar página pública `/contrato/:token` (ClientContractPortal)
- Rota pública (sem auth) no `App.tsx`
- Busca contrato pelo `public_token` (RLS bypassed via security definer function)
- Exibe:
  - Preview do contrato em iframe
  - Botões: Imprimir / Baixar PDF
  - Seção de assinatura digital (canvas de desenho, reutilizando padrão do `DealRoomSignature`)
  - Upload de selfie (câmera ou arquivo)
  - Upload de foto do documento (frente)
  - Opção "Assinar via Gov.br" (link para assinador.iti.br)
  - Botão "Confirmar e Enviar" que salva tudo e atualiza status para 'assinado'
- Design responsivo, mobile-first

#### 4. Atualizar `handleContractConfirm` no `useSimulatorActions`
- Remover `openContractPrintWindow` automático
- Após salvar o contrato, manter o editor aberto com toast de sucesso
- Separar ações: salvar ≠ imprimir ≠ enviar

#### 5. Edge Function para acesso público ao contrato
- Criar function `public-contract` que busca contrato por token sem exigir JWT
- Aceita uploads de assinatura/selfie/documento para o bucket `contract-signatures`

### Detalhes Técnicos

**Arquivos a criar:**
- `src/pages/ClientContractPortal.tsx` — página pública do portal
- `src/components/contract/ContractSignaturePad.tsx` — componente de assinatura
- `src/components/contract/ContractDocumentUpload.tsx` — upload de selfie/documento
- `supabase/functions/public-contract/index.ts` — API pública para contratos
- Migration SQL para novas colunas

**Arquivos a modificar:**
- `src/components/ContractEditorDialog.tsx` — nova barra de ações
- `src/hooks/useSimulatorActions.ts` — separar salvar de imprimir
- `src/App.tsx` — nova rota `/contrato/:token`

**Dependências existentes reutilizadas:**
- `buildContractDocumentHtml` de `contractDocument.ts`
- `generateBudgetPdfServerSide` de `pdfService.ts`
- Padrão de assinatura do `DealRoomSignature.tsx`
- Padrão Gov.br do `DealRoomContractPdf.tsx`

