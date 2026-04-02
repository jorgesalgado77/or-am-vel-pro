## MIA Core — Plano de Implementação Seguro

### Princípio: As edge functions existentes NÃO serão alteradas. O MIA Core é uma camada de orquestração no frontend que centraliza chamadas, contexto e memória.

### FASE 1 — MIAOrchestrator (Serviço Central)
- Criar `/services/mia/MIAOrchestrator.ts`
- Método central `handleRequest(context)` que roteia para a edge function correta
- Contextos suportados: `vendazap`, `dealroom`, `onboarding`, `commercial`, `cashflow`, `campaign`, `argument`
- Resolução automática de tenant_id e user_id

### FASE 2 — Engines Internas  
- Criar engines especializados que encapsulam a lógica de chamada:
  - `VendaZapEngine` → invoca `vendazap-ai`
  - `DealRoomEngine` → invoca `vendazap-ai` (com contexto DealRoom)
  - `OnboardingEngine` → invoca `onboarding-ai`
  - `CommercialEngine` → invoca `commercial-ai`
  - `CashflowEngine` → invoca `cashflow-ai`
  - `ArgumentEngine` → invoca `improve-argument`

### FASE 3 — Memory Engine
- Criar `/services/mia/MIAMemoryEngine.ts`
- Memória por tenant + user (IndexedDB para persistência local)
- Armazena: contexto da conversa, preferências detectadas, histórico de decisões
- Injeta contexto automaticamente nas chamadas

### FASE 4 — Transformar Assistentes Existentes
- `DealRoomAIAssistant` → manter UI, trocar chamada direta por `MIAOrchestrator.handleRequest()`
- `OnboardingAIAssistant` → manter UI, trocar hook por chamada via orchestrator
- `CampaignAIGenerator` → manter UI, usar orchestrator

### FASE 5 — Action Engine
- Criar `/services/mia/MIAActionEngine.ts`
- Executar ações reais: criar tarefa, navegar, salvar configuração
- Integrado ao orchestrator via `action` no response

### FASE 6 — Isolamento & Validação
- Garantir que cada chamada inclui tenant_id e user_id
- Zero cruzamento de dados entre tenants
- Memória isolada por tenant+user

### Arquivos criados:
- `src/services/mia/MIAOrchestrator.ts`
- `src/services/mia/MIAMemoryEngine.ts`  
- `src/services/mia/MIAActionEngine.ts`
- `src/services/mia/engines/VendaZapEngine.ts`
- `src/services/mia/engines/DealRoomEngine.ts`
- `src/services/mia/engines/OnboardingEngine.ts`
- `src/services/mia/engines/CommercialEngine.ts`
- `src/services/mia/engines/CashflowEngine.ts`
- `src/services/mia/engines/ArgumentEngine.ts`
- `src/services/mia/types.ts`
- `src/services/mia/index.ts`

### Arquivos modificados (apenas chamadas):
- `src/components/dealroom/DealRoomAIAssistant.tsx`
- `src/components/campaigns/CampaignAIGenerator.tsx`
- `src/hooks/useOnboardingAI.ts` (ou equivalente)

### NÃO modificados:
- Nenhuma edge function
- Nenhuma lógica de negócio existente
