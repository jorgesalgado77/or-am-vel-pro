

## Plano: Sistema de Contrato Dinâmico — Evolução do Fluxo Existente

### Diagnóstico: O que já existe vs. o que falta

O sistema já possui **quase tudo** que o prompt descreve:

| Funcionalidade | Status | Localização |
|---|---|---|
| Botão "Fechar Venda" com validação | ✅ Existe | `useSimulatorActions.handleCloseSale` |
| Modal com dados do cliente/contrato | ✅ Existe | `CloseSaleModal` |
| Auto-preenchimento do formulário | ✅ Existe | `handleCloseSaleConfirm` monta formData |
| Template dinâmico com {{variáveis}} | ✅ Existe | `buildContractHtml` em `contractService.ts` |
| Auto-variáveis (botão Wand2) | ✅ Existe | `ContractEditorDialog.handleAutoVariables` |
| Preview HTML do contrato | ✅ Existe | iframe com `srcDoc` |
| Salvar contrato no banco | ✅ Existe | `handleContractSave` → `client_contracts` |
| Enviar ao Cliente (link público) | ✅ Existe | `handleSendToClient` gera `public_token` |
| Snapshot via form_data (JSONB) | ✅ Parcial | Salva `form_data` mas não `snapshot` completo |
| PDF real (server-side) | ❌ Falta | Usa `window.print()` como workaround |
| Snapshot HTML final persistido | ❌ Parcial | Salva `conteudo_html` mas sem snapshot de dados |

### O que será implementado

Apenas as lacunas reais, sem tocar no fluxo funcional:

---

#### 1. PDF Real via Edge Function (substituir workaround do print)

**Arquivo:** `src/components/ContractEditorDialog.tsx`

- Substituir `handleDownloadPdf` para chamar a Edge Function `generate-pdf` existente com o HTML do contrato
- Enviar o HTML renderizado para a função server-side que gera PDF via jsPDF
- Receber URL assinada do bucket e disparar download automático
- Manter botão "Imprimir" separado (via `window.print()`)

**Arquivo:** `supabase/functions/generate-pdf/index.ts`

- Adicionar nova action `generate-contract-pdf` que recebe HTML do contrato
- Converter HTML para PDF usando jsPDF (já disponível na função)
- Salvar no bucket `budget-pdfs` e retornar URL assinada

**Arquivo:** `src/pages/ClientContractPortal.tsx`

- Atualizar `handleDownloadPdf` para também usar a Edge Function em vez de `window.print()`

---

#### 2. Snapshot Completo (segurança jurídica)

**Arquivo:** `src/hooks/useSimulatorActions.ts` → `handleContractSave`

- Ao salvar o contrato, persistir um campo `snapshot` (JSONB) contendo:
  - Todos os dados do formulário (`formData`)
  - Itens e detalhes técnicos (`items`, `itemDetails`)
  - Valores financeiros calculados (`valorFinal`, `parcelas`, `entrada`)
  - Produtos do catálogo
  - Data/hora exata da geração
- O `conteudo_html` já salva o HTML final — adicionar `snapshot` como dados estruturados

**Migração SQL** (fornecida para execução manual):
- Adicionar coluna `snapshot` (jsonb, nullable) à tabela `client_contracts`

---

#### 3. Garantir que Preview = PDF Final

**Arquivo:** `src/components/ContractEditorDialog.tsx`

- Antes de gerar PDF, sincronizar o HTML do editor com o estado atual (caso tenha sido editado)
- O PDF será gerado a partir do mesmo HTML exibido no preview, garantindo fidelidade

---

### Arquivos a modificar

| Arquivo | Alteração |
|---|---|
| `src/components/ContractEditorDialog.tsx` | Novo `handleDownloadPdf` com PDF server-side |
| `src/hooks/useSimulatorActions.ts` | Adicionar `snapshot` ao insert de `client_contracts` |
| `supabase/functions/generate-pdf/index.ts` | Nova action `generate-contract-pdf` |
| `src/pages/ClientContractPortal.tsx` | PDF real no portal público |

### SQL para execução manual

```sql
ALTER TABLE client_contracts
ADD COLUMN IF NOT EXISTS snapshot jsonb;

COMMENT ON COLUMN client_contracts.snapshot IS 'Snapshot completo dos dados do contrato no momento da geração (segurança jurídica)';
```

### O que NÃO será alterado

- Fluxo de navegação (Simulador → Fechar Venda → Editor)
- `CloseSaleModal` (mantido como está)
- `buildContractHtml` (já funcional)
- Sistema de auto-variáveis (já funcional)
- Envio ao cliente / portal público (já funcional)
- Estrutura de templates (já funcional)

