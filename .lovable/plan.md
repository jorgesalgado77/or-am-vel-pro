

# Plano de Implementação Estratégica — VendaZap + MIA + Promob + IA de Fechamento

## Relatório de Auditoria (Fase 0)

### O que JÁ EXISTE e está FUNCIONAL:
- **VendaZap Chat**: `VendaZapChat.tsx`, `ChatWindow.tsx`, `ChatInput.tsx`, `ChatMessageBubble.tsx` — chat completo com UI
- **Webhook WhatsApp**: `supabase/functions/whatsapp-webhook/index.ts` (752 linhas) — recebe mensagens Z-API/Evolution, scoring de roteamento, dedup por `external_id`
- **Gateway WhatsApp**: `supabase/functions/whatsapp-gateway/` — envio de mensagens para Z-API
- **Realtime**: `useRealtimeMessages.ts` — escuta INSERT/UPDATE em `tracking_messages`
- **AutoPilot**: `useAutoPilot.ts` (300 linhas) — resposta automática com controle de tokens/dia
- **MIA Orchestrator**: `MIAOrchestrator.ts` com 7 engines registrados (VendaZap, DealRoom, Onboarding, Commercial, Cashflow, Argument, Campaign)
- **MIA Memory/Learning/Action**: Engines completos com persistência
- **Proactive Alerts**: `useMIAProactiveAlerts.ts` — alertas por cargo (vendedor, gerente, projetista)
- **Critical Toasts**: `useMIACriticalToasts.ts` — avisos de alta prioridade
- **Contextual Tips**: `useMIAContextualTips.ts` — dicas por módulo
- **Commercial Decision Engine**: `CommercialDecisionEngine.ts` (703 linhas) — análise de deal, cenários, descontos, triggers
- **Negotiation Control Engine**: `NegotiationControlEngine.ts` (667 linhas) — estratégia, timing, fechamento, feedback loop
- **Negotiation Arbitrage**: `NegotiationArbitrageEngine.ts` — brinde vs desconto
- **AI Closer Banner**: `AICloserBanner.tsx` (318 linhas) — detecção de intenção de compra, cenários, proposta
- **Importação Promob**: `fileImportService.ts` (854 linhas) — suporta TXT fixo, CSV, XML com módulos, normalização de acabamentos
- **Triggers VendaZap**: `useVendaZapTriggers.ts` — gatilhos automáticos com CDE

### O que está INCOMPLETO ou precisa de melhorias:
1. **Sync bidirecional**: O webhook recebe mensagens externas, mas a confirmação de leitura (`status` delivery/read) pode não estar atualizando a UI em tempo real
2. **MIA como agente ativo**: Alertas proativos existem mas são passivos (exigem abertura do chat MIA) — faltam ações automáticas com confirmação
3. **Promob parser**: Falta extração de campos específicos: `tipo_porta`, `dobradiça` (modelo específico), `corrediça` (modelo), `cor_porta` vs `cor_caixa` separados explicitamente, `espessura` como campo dedicado
4. **IA de Fechamento**: O `AICloserBanner` detecta intenção mas a integração com envio direto ao WhatsApp e o aprendizado pós-negociação pode ser mais robusto

### Duplicidades encontradas:
- Nenhuma duplicidade crítica — código bem modularizado

---

## Plano de Implementação por Fases

### FASE 1 — VendaZap: Sync Perfeito
**Arquivos a modificar:**

1. **`supabase/functions/whatsapp-webhook/index.ts`** — Adicionar processamento de status callbacks (delivery/read) para atualizar `tracking_messages.status`
2. **`src/hooks/useRealtimeMessages.ts`** — Expandir listener para refletir mudanças de `status` na UI (ticks azuis/cinza)
3. **`src/components/chat/ChatMessageBubble.tsx`** — Adicionar indicadores visuais de status (sent ✓, delivered ✓✓, read ✓✓ azul)
4. **`src/components/chat/ChatWindow.tsx`** — Garantir scroll automático e sincronização de histórico ao abrir conversa

### FASE 2 — MIA Operacional
**Arquivos a criar/modificar:**

1. **`src/services/mia/MIAMonitorService.ts`** (NOVO) — Serviço que periodicamente analisa leads parados, simulações sem resposta, chats sem interação, usando dados existentes das tabelas `clients`, `simulations`, `tracking_messages`
2. **`src/hooks/useMIAProactiveAlerts.ts`** — Expandir para incluir ações executáveis (enviar mensagem, agendar follow-up) com confirmação do usuário
3. **`src/services/mia/ActionExecutionEngine.ts`** — Conectar ações de MIA ao `whatsapp-gateway` para envio real de mensagens (com modo seguro/confirmação)
4. **`src/components/chat/VendaZapChat.tsx`** — Integrar banner de sugestões MIA inline no chat

### FASE 3 — Refinamento Promob
**Arquivos a modificar:**

1. **`src/services/fileImportService.ts`** — Expandir `ParsedModule` e parsers para incluir: `doorType`, `hingeModel`, `slideModel`, `boxColor`, `doorColor`, `thickness` como campos dedicados. Adicionar funções `normalizeMaterial()`, `normalizeHardware()`. Melhorar fallback inteligente com valores padrão do tenant
2. **`src/services/fileImportService.test.ts`** — Adicionar testes para os novos campos

### FASE 4 — IA de Fechamento Aprimorada
**Arquivos a modificar:**

1. **`src/components/chat/AICloserBanner.tsx`** — Integrar botão de envio direto ao WhatsApp via `whatsapp-gateway`
2. **`src/hooks/useNegotiationControl.ts`** — Expandir `recordFeedback` para registrar taxa de conversão e comportamento pós-negociação
3. **`src/services/commercial/NegotiationControlEngine.ts`** — Adicionar consulta a `ai_learning_events` para melhorar previsões baseadas em histórico real

### FASE 5 — Integração Total
- Garantir que `AICloserBanner` → `NegotiationControlEngine` → `CommercialDecisionEngine` → `whatsapp-gateway` funciona como pipeline
- Conectar `MIAMonitorService` ao `VendaZapTriggers` para unificar gatilhos

### FASE 6-7 — Segurança e Performance
- Validar `tenant_id` em todos os novos serviços
- Usar edge functions para operações pesadas (já existentes)
- Lazy loading nos componentes novos

### FASE 8-9 — Testes e Auditoria
- Expandir testes Vitest para novos parsers e engines
- Verificar código morto e inconsistências

---

## Estimativa de Escopo

| Fase | Arquivos | Complexidade |
|------|----------|-------------|
| F1 — VendaZap Sync | 4 arquivos | Média |
| F2 — MIA Operacional | 4 arquivos | Alta |
| F3 — Promob | 2 arquivos | Média |
| F4 — IA Fechamento | 3 arquivos | Média |
| F5-9 — Integração/QA | Transversal | Média |

**Proposta**: Implementar fase por fase, começando pela Fase 1, para garantir estabilidade a cada etapa.

