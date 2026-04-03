## Plano de Implementação — Importador Promob Avançado

### Escopo (baseado na auditoria)
O parser atual (`fileImportService.ts`) já funciona para importação básica. As 2 evoluções solicitadas:

---

### FASE 1 — Tipos e Estrutura de Dados

**Arquivo:** `src/services/fileImportService.ts`

Adicionar ao `ParsedFileResult`:
```typescript
interface ParsedModule {
  id: string;
  code: string;           // código referência (ex: 820227748)
  description: string;    // ARMARIO L1000 H700 P530 BRISA
  type: "modulo" | "porta" | "frente" | "gaveta" | "painel" | "acessorio";
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  dimensions: string;     // 1000 x 700 x 530
  finish: string;         // acabamento normalizado (ex: "Brisa")
  supplier: string;       // fornecedor (ex: "Criare")
}

// Adicionar ao ParsedFileResult:
modules?: ParsedModule[];
```

Adicionar ao `ImportedEnvironment`:
```typescript
modules?: ParsedModule[];
```

---

### FASE 2 — Normalização de Cores/Materiais

**Arquivo:** `src/services/fileImportService.ts` (novo helper interno)

Mapa de normalização:
- "BRISA" → "Brisa"
- "NOGUEIRA AVENA" / "NOG AVENA" / "NOG AVE" / "NOGU" → "Nogueira Avena"  
- "BRANCO TX" / "BRANCO" / "BRA AUR" → "Branco"
- "PRETO FOSCO" / "PRE FOS" → "Preto Fosco"
- Extensível via mapa `Record<RegExp, string>`

---

### FASE 3 — Parser TXT Avançado (Promob)

**Arquivo:** `src/services/fileImportService.ts` — evoluir `parsePromobTxt()`

O formato TXT do Promob (real):
```
seq  qty  code  DESCRIPTION  unit_price  total_price  dimensions
1    3    820227748  ARMARIO L1000 H700 P530 BRISA  349.48  1048.43  1000 x 700 x 530
```

Classificar cada item por tipo (ARMARIO→modulo, PORTA→porta, GAVETA→gaveta, PAINEL→painel, DOBRADICA/PARAFUSO→acessorio).

Extrair: ambiente do header (DATA ID="Environment"), fornecedor das REFERENCES, acabamento da DESCRIPTION.

---

### FASE 4 — Parser XML Avançado (Promob)

**Arquivo:** `src/services/fileImportService.ts` — evoluir parser XML para Promob

O XML tem estrutura `<ITEM>` com atributos:
- `DESCRIPTION`, `REFERENCE`, `QUANTITY`, `WIDTH/HEIGHT/DEPTH`
- `<PRICE>` com TABLE, TOTAL
- `<REFERENCES>` com `<FORNECEDOR>`, `<ACAB>`, `<MODEL>`
- `<MARGINS>` com ORDER (custo) e BUDGET (venda)

Extrair cada `<ITEM>` como um `ParsedModule`.

---

### FASE 5 — Integração com Simulador

**Arquivo:** `src/hooks/useSimulatorActions.ts`

No `handleFileImport`, mapear `parsed.modules` para o `ImportedEnvironment`.

---

### FASE 6 — UI: ListView com Módulos Expandíveis

**Arquivo:** `src/components/simulator/SimulatorEnvironmentsTable.tsx`

Adicionar seção colapsável dentro de cada ambiente para exibir módulos:
- Nome do módulo + tipo + qtd + valor
- Acabamento normalizado como badge

---

### FASE 7 — Testes

Criar testes com os dados reais do TXT e XML fornecidos pelo usuário.

---

### O que NÃO será alterado
- Lógica de cálculo do simulador
- Fluxo de fechamento de venda
- Integração com MIA (fase futura)
- Estrutura do banco de dados
