

## Plano: Importador PDF Pixel-Perfect — Evolução do Sistema Existente

### Diagnóstico

O importador atual (`contractImport.ts` → `buildPdfPageHtml`) já usa posicionamento absoluto com percentuais, mas tem problemas:

| Problema | Causa |
|---|---|
| Layout quebrado | Não captura font-family, font-weight, cor, alinhamento |
| Tabelas desalinhadas | Texto posicionado individualmente sem detectar estrutura de tabela |
| Sobreposição de textos | Cálculo de `topPercent` não agrupa linhas adjacentes |
| Fontes inconsistentes | Não extrai informação de fonte do PDF |

O sistema de variáveis (`FIELD_PATTERNS`, `replaceDetectedFieldsWithPlaceholders`) já funciona mas é aplicado apenas como opt-in.

### Solução em 3 Frentes

---

#### 1. Melhorar `buildPdfPageHtml` (fidelidade visual)

**Arquivo:** `src/lib/contractImport.ts`

- Extrair informações de fonte (fontName) via `page.commonObjs` do pdfjs para aplicar `font-family` e `font-weight` no HTML
- Agrupar text items da mesma linha (Y similar dentro de threshold) em um único `<span>` para evitar sobreposição
- Detectar blocos tabulares (items alinhados em grid X/Y) e gerar `<table>` HTML em vez de divs absolutas
- Usar `page.getOperatorList()` para capturar linhas/retângulos decorativos e renderizar como `<hr>` ou bordas CSS
- Definir página com dimensões fixas (`width:210mm; height:297mm`) com `overflow:hidden` para fidelidade A4

**Nova função auxiliar `groupTextLines`:**
- Agrupa items cujo `y` difere por menos que `fontSize * 0.3`
- Ordena por `x` dentro de cada linha
- Junta textos com espaçamento proporcional

**Nova função auxiliar `detectTableBlocks`:**
- Identifica items onde 3+ linhas consecutivas têm items alinhados nas mesmas posições X (colunas)
- Gera `<table>` com `<td>` posicionados por coluna

---

#### 2. Renderização de imagem de fundo como fallback (pixel-perfect real)

**Arquivo:** `src/lib/contractImport.ts`

Para PDFs complexos com gráficos/logos, renderizar cada página como imagem PNG via canvas do pdfjs e usá-la como `background-image` da página, com o texto posicionado por cima (transparente mas selecionável):

```text
┌─────────────────────────┐
│  background: page.png   │  ← imagem renderizada pelo pdfjs canvas
│  ┌───────────────────┐  │
│  │ texto invisível   │  │  ← texto posicionado absolutamente (color: transparent)
│  │ mas selecionável  │  │     para permitir busca/edição
│  └───────────────────┘  │
└─────────────────────────┘
```

- Renderizar via `page.render({ canvasContext })` para obter PNG base64
- Incluir como `background-image` inline no CSS da seção
- Texto fica com `color: transparent` por padrão, visível ao editar
- Ao salvar como template, o admin escolhe: manter imagem de fundo ou usar só texto

---

#### 3. Armazenamento híbrido (HTML + JSON blocks)

**Migração SQL** (para execução manual no Supabase):

```sql
ALTER TABLE contract_templates
ADD COLUMN IF NOT EXISTS template_structure jsonb,
ADD COLUMN IF NOT EXISTS template_type text DEFAULT 'flow';

COMMENT ON COLUMN contract_templates.template_structure IS 'Estrutura JSON com blocos posicionais do template importado';
COMMENT ON COLUMN contract_templates.template_type IS 'Tipo: flow (texto corrido), absolute (posicional), hybrid (ambos)';
```

**Arquivo:** `src/lib/contractImport.ts`

- `importPdf` retorna novo campo `structure` com array de blocos JSON:
  ```
  { type: "text"|"table"|"image", x, y, w, h, content, fontSize, fontFamily, ... }
  ```

**Arquivo:** `src/components/settings/ContratosTab.tsx`

- Ao salvar template importado, persistir `template_structure` e `template_type` junto com `conteudo_html`
- No carregamento, se `template_type === "absolute"`, usar CSS de posicionamento fixo no preview

---

### Arquivos a Modificar

| Arquivo | Alteração |
|---|---|
| `src/lib/contractImport.ts` | Reescrever `buildPdfPageHtml` com agrupamento de linhas, detecção de tabelas, extração de fontes, renderização canvas como background |
| `src/components/settings/ContratosTab.tsx` | Salvar `template_structure` e `template_type`; opção de manter/remover background de imagem |
| `src/hooks/useSimulatorActions.ts` | Ao renderizar contrato, verificar `template_type` para usar layout correto |

### SQL para execução manual

```sql
ALTER TABLE contract_templates
ADD COLUMN IF NOT EXISTS template_structure jsonb,
ADD COLUMN IF NOT EXISTS template_type text DEFAULT 'flow';
```

### O que NÃO será alterado

- Fluxo de contrato (Simulador → Fechar Venda → Editor → Preview)
- Sistema de variáveis `{{...}}` e `FIELD_PATTERNS`
- `ContractEditorDialog`, `CloseSaleModal`, portal público
- Funções de highlight/auto-variáveis existentes

