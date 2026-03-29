

# Negotiation Arbitrage Engine — Plano de Implementação

## Resumo

Criar um motor de arbitragem de negociação que se integra ao CommercialDecisionEngine existente, oferecendo cenários inteligentes que comparam **brinde estratégico vs desconto direto**, com proteção de margem, aprendizado contínuo e integração com VendaZap.

## Arquitetura

```text
┌──────────────────────────────┐
│   CommercialDecisionEngine   │ (existente, não modificado)
│   ├─ analyzeDeal()           │
│   ├─ generateScenarios()     │
│   └─ decideNextAction()      │
└──────────┬───────────────────┘
           │ usa
┌──────────▼───────────────────┐
│  NegotiationArbitrageEngine  │ (NOVO)
│   ├─ generateArbitrageScenarios()
│   ├─ findStrategicGifts()    │
│   ├─ calculateGap()          │
│   ├─ validateMargin()        │
│   └─ recordOutcome()         │
└──────────┬───────────────────┘
           │ consulta
    ┌──────▼──────┐
    │ products    │ (catálogo existente)
    │ catalog     │
    └─────────────┘
```

## Arquivos a Criar/Editar

### 1. NOVO: `src/services/commercial/NegotiationArbitrageEngine.ts`

Motor principal com tipos e lógica:

- **Tipos**: `ArbitrageContext`, `ArbitrageScenario` (3 cenários: valor_maximo, equilibrado, agressivo), `GiftSuggestion`, `ArbitrageResult`
- **`generateArbitrageScenarios(ctx)`**: Gera 3 cenários com cálculo de GAP, margem e probabilidade
- **`findStrategicGifts(tenantId, budget, category)`**: Busca produtos do catálogo (`products_catalog`) que caibam no orçamento de brinde sem ultrapassar margem mínima
- **`calculateGap(proposta, concorrente)`**: Calcula diferença real e impacto na margem
- **`validateMargin(scenario, rules)`**: Valida contra `sales_rules` do tenant
- **`recordOutcome(scenarioChosen, result)`**: Registra em `ai_learning_events` com `event_type: "arbitrage_scenario"` e metadata do cenário

Integração com `getCommercialEngine()` para análise de deal e `getOptimizationEngine()` para aprendizado.

### 2. NOVO: `src/hooks/useNegotiationArbitrage.ts`

Hook React que expõe:
- `generateScenarios(clientId, valorProposta, valorConcorrente?)` 
- `approveScenario(scenarioId)` (aprovação gerente)
- `editScenario(scenarioId, overrides)` (override manual)
- `selectAndRecord(scenario, result)` (feedback loop)
- Estados: `scenarios`, `loading`, `selectedScenario`

### 3. NOVO: `src/components/commercial/ArbitragePanel.tsx`

Painel UI com:
- 3 cards de cenários (Valor Máximo, Equilibrado, Agressivo)
- Badge de margem e probabilidade em cada cenário
- Lista de brindes sugeridos (com imagem/nome do catálogo)
- Botão "Gerar Mensagem" que cria copy para VendaZap
- Botão "Aprovar" (visível apenas para Admin/Gerente)
- Botão "Editar" para override manual de valores

### 4. EDITAR: `src/services/commercial/types.ts`

Adicionar novo event_type `"arbitrage_scenario"` e strategy `"brinde"` nos tipos existentes (sem quebrar).

### 5. EDITAR: `src/services/commercial/index.ts`

Exportar `NegotiationArbitrageEngine` e `getArbitrageEngine`.

### 6. EDITAR: `src/services/ai/types.ts`

Adicionar `"arbitrage_scenario"` ao `LearningEventType` e `"brinde"` ao `StrategyType`.

### 7. EDITAR: `src/components/commercial/CommercialAIPanel.tsx`

Adicionar nova aba "Arbitragem" com o `ArbitragePanel`.

## Detalhes Técnicos

**Cenários gerados:**

| Cenário | Desconto | Brinde | Parcelamento | Margem |
|---------|----------|--------|--------------|--------|
| Valor Máximo | 0% | Produto estratégico do catálogo | À vista | Máxima |
| Equilibrado | Moderado | Opcional | Boleto médio | Média |
| Agressivo | Máximo permitido | Nenhum | Máx parcelas | Mínima permitida |

**Busca de brindes**: Query `products_catalog` filtrando `tenant_id`, `stock_quantity > 0`, `cost_price <= orçamento_brinde` (calculado como % da margem excedente), ordenado por `cost_price DESC` para maximizar valor percebido.

**Feedback loop**: Cada cenário escolhido grava em `ai_learning_events` com metadata `{ scenario_type, gift_included, gap_value, competitor_price }`. O `OptimizationEngine` já consome essa tabela.

**Intervenção humana**: Campo `approved_by` opcional no cenário. Se `sales_rules.approval_required_above` for atingido, o cenário fica em estado "pendente" até aprovação.

**Integração VendaZap**: Botão "Gerar Mensagem" chama `generateMessageContext()` do CDE existente, adicionando dados do cenário de arbitragem ao contexto para personalização.

## SQL Necessário

Nenhuma tabela nova necessária. Os eventos são registrados na tabela `ai_learning_events` existente. Apenas os tipos TypeScript precisam ser estendidos para incluir os novos valores de enum.

