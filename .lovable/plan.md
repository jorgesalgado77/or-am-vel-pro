

# Plano de Auditoria Global + Otimização — OrçaMóvel PRO

## Diagnóstico Atual

Após análise completa do código, identifiquei os seguintes pontos de ação organizados por prioridade:

### Estado Atual (o que já está bem)
- Lazy loading já implementado em todas as views do Index.tsx e tabs do Settings
- DRACOLoader já integrado no GLBViewer para compressão GLB
- Renderização on-demand (needsRenderRef) já implementada no 3D viewer
- FPS monitor com auto-downgrade de pixel ratio já funcional
- OrbitControls com damping já configurado corretamente
- Centralização e normalização de modelos 3D já existentes
- Frustum culling ativado nos objetos 3D
- Color space (sRGBColorSpace) e tone mapping (ACES) já configurados
- Preservação de materiais originais já implementada
- Architecture modular com modules/ barrel exports
- RLS e tenant isolation já configurados

---

## Fase 1 — Limpeza e Código Morto

### 1.1 Remover console.logs de produção
- `DealRoomSimulation.tsx` linhas 63, 79: remover `console.log` de debug

### 1.2 Padronizar imports do Supabase
- 11 arquivos importam de `@/integrations/supabase/client` diretamente em vez de `@/lib/supabaseClient`
- Ambos apontam para o mesmo client, mas padronizar para `@/lib/supabaseClient` em todos

### 1.3 Remover `eslint-disable` desnecessário
- `ClientsKanban.tsx` linha 1: remover `/* eslint-disable */`

---

## Fase 2 — Performance Frontend

### 2.1 React.memo nos componentes de lista
- `KanbanCard` — componente renderizado dezenas de vezes no Kanban, sem memo
- `ChatConversationList` items — re-renderiza toda lista ao selecionar conversa
- `ChatMessageBubble` — memo para evitar re-render de mensagens

### 2.2 useCallback/useMemo em handlers pesados
- `ClientsKanban`: memoizar handlers de filtro e drag-drop
- `VendaZapChat`: memoizar `handleSelectConversation`

### 2.3 Virtualização de listas longas (se >50 items)
- Considerar `react-window` para a lista de conversas do VendaZap se tiver muitas conversas

---

## Fase 3 — 3D Smart Import (CRÍTICO)

### 3.1 O que já funciona (NÃO tocar)
- DRACOLoader com decoders CDN ✅
- sRGBColorSpace + ACESFilmicToneMapping ✅  
- enableDamping + dampingFactor ✅
- Centralização e escala automáticas ✅
- FPS monitor com auto-downgrade ✅
- Preservação de materiais originais ✅
- frustumCulled = true ✅
- On-demand rendering ✅

### 3.2 Melhorias a implementar
- **Geometry Instancing**: detectar meshes com geometria idêntica e usar `InstancedMesh`
- **LOD (Level of Detail)**: para modelos com >50k vértices, criar versões simplificadas
- **Web Worker para DXF parsing**: mover `parseDxfEntities` para Web Worker para não bloquear UI thread
- **Texture cache por hash**: criar tabela `textures_cache(id, hash, url, created_at)` no Supabase e reutilizar texturas duplicadas no upload

### 3.3 Qualidade de render adicional
- Adicionar **Environment Map** sutil (não HDRI pesado) para reflexos realistas em materiais metálicos
- **Soft shadows** já disponível no preset "high" — apenas ajustar shadow map bias

---

## Fase 4 — Segurança

### 4.1 Validação de inputs
- Adicionar `zod` validation nos formulários de lead capture (já parcialmente implementado em LandingLeadForm)
- Validar inputs no briefing modal antes de salvar
- Sanitizar `projectName` no upload 3D contra XSS

### 4.2 RLS audit
- Auditoria de RLS já concluída em 41 tabelas (conforme memória)
- Verificar tabelas novas: `client_briefings`, `lead_attachments` — adicionar RLS se ausente

### 4.3 SQL para segurança adicional (entregar ao usuário)
```sql
-- RLS para client_briefings e lead_attachments
```

---

## Fase 5 — VendaZap AI Otimização

### 5.1 O que já existe
- Debounce de 800ms na sugestão AI ✅
- Auto-pilot com processamento assíncrono ✅

### 5.2 Melhorias
- Cache de sugestões AI recentes em memória (Map com TTL de 5 min) para evitar chamadas repetidas para o mesmo contexto
- Limitar histórico de mensagens no auto-pilot de 8 para 5 (reduzir tokens)

---

## Fase 6 — Deal Room Otimização

### 6.1 Remover logs de debug
- `DealRoomSimulation.tsx`: remover console.logs

### 6.2 Lazy load de componentes pesados
- Já implementado via lazy loading no Index.tsx ✅
- Verificar sub-componentes como `DealRoomMeeting` (Jitsi/Daily.co) — lazy load interno

---

## Fase 7 — Banco de Dados

### 7.1 SQL de otimização (entregar ao usuário)
- Índices adicionais para queries frequentes
- Tabela `textures_cache` para o 3D
- RLS para tabelas novas

---

## Resumo de Arquivos Modificados

| Arquivo | Ação |
|---------|------|
| `DealRoomSimulation.tsx` | Remover console.logs |
| `KanbanCard.tsx` | Adicionar React.memo |
| `ChatMessageBubble.tsx` | Adicionar React.memo |
| `ChatConversationList.tsx` | React.memo nos items |
| `ClientsKanban.tsx` | Remover eslint-disable, memoizar handlers |
| 11 arquivos com import direto | Padronizar para `@/lib/supabaseClient` |
| `modelPreviewUtils.ts` | Adicionar instancing detection |
| `GLBViewer.tsx` | Environment map sutil para qualidade |
| `VendaZapChat.tsx` | Cache de sugestões AI |
| `BriefingModal.tsx` | Validação zod nos inputs |
| SQL script | Textures cache, RLS, índices |

### Estimativa: ~15 edições de código + 1 SQL script

