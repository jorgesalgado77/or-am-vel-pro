

# Plano — Refatoração Total 3D Import + Builder Paramétrico

Este é um projeto de grande escala que precisa ser executado em fases incrementais para não quebrar o sistema existente. Abaixo está o plano completo organizado por prioridade de execução.

---

## Estado Atual (auditoria concluída)

O que já funciona bem e NÃO será tocado:
- DRACOLoader com CDN decoders
- sRGBColorSpace + ACESFilmicToneMapping
- OrbitControls com damping
- FPS monitor com auto-downgrade de pixel ratio
- Geometry Instancing (detecta meshes repetidas)
- PMREMGenerator para reflexos metálicos
- Frustum culling ativado
- On-demand rendering (needsRenderRef)
- Preservação de materiais originais
- 3 níveis de qualidade (low/balanced/high)
- Presets de background, iluminação
- Seleção de peças com emissive glow
- Thumbnail automático no upload
- DXF parser com ACI color mapping
- Motor de orçamento inteligente com sugestões IA
- Biblioteca de módulos com catálogo de componentes

Problemas identificados:
- DXF parser roda na main thread (bloqueia UI em arquivos grandes)
- Sem LOD para modelos pesados (>50k vértices)
- Sem suporte touch (pointer events)
- Sem builder paramétrico
- Sem sistema de bibliotecas hierárquicas
- Sem motor de vãos internos
- Sem integração direta com o simulador de negociação
- BudgetGenerator.tsx é duplicata parcial do SmartBudgetPanel.tsx

---

## FASE 1 — Performance e Correções Críticas
**~8 arquivos modificados**

### 1.1 Web Worker para DXF Parsing
- Criar `src/workers/dxfParserWorker.ts` — mover `parseDxfEntities` para Worker
- Em `modelPreviewUtils.ts` — chamar o Worker via `new Worker()` com fallback inline

### 1.2 LOD (Level of Detail)
- Em `modelPreviewUtils.ts` — após `prepareObjectForPreview`, detectar meshes com >50k vértices
- Criar versão simplificada via `THREE.BufferGeometryUtils.mergeVertices()` com tolerance
- Usar `THREE.LOD` para alternar entre versões baseado na distância da câmera

### 1.3 Material Cache Global
- Criar `src/lib/textureCache.ts` — Map global com hash de textura para evitar duplicação
- Integrar no `prepareObjectForPreview` para reutilizar materiais idênticos
- Consultar tabela `textures_cache` do Supabase para persistência cross-session

### 1.4 Remover Duplicata
- `BudgetGenerator.tsx` — já substituído pelo `SmartBudgetPanel.tsx` (mais completo)
- Verificar se ainda é referenciado; se não, remover o arquivo

---

## FASE 2 — Suporte Touch Completo
**~2 arquivos modificados**

### 2.1 Pointer Events no GLBViewer
- Em `GLBViewer.tsx` — substituir `click` listener por `pointerdown`/`pointerup` com detecção de tap vs drag
- Adicionar threshold de 5px para distinguir tap de pan
- OrbitControls já suporta touch nativamente (pinch zoom, rotate)

### 2.2 CSS Touch Optimizations
- Adicionar `touch-action: none` ao canvas para evitar scroll do browser
- Testar em viewport mobile (767px)

---

## FASE 3 — Builder Paramétrico (Novo Core)
**~5 novos arquivos**

### 3.1 Tipos e Estrutura
- Criar `src/types/parametricModule.ts`:
  - `ParametricModule` (largura, altura, profundidade, prateleiras, divisões, componentes)
  - `ModuleSlot` (posição, dimensões, conteúdo)
  - `InternalComponent` (prateleira, gaveta, porta, divisória)

### 3.2 Motor de Vãos Internos
- Criar `src/lib/spanEngine.ts`:
  - `calculateInternalSpans(module)` — retorna vãos calculados
  - Fórmulas: `vaoInterno = alturaTotal - (topo + base)`, `vaoLivre = vaoInterno - (qtdPrateleiras * espessura)`, `vaoUnitario = vaoLivre / (qtdPrateleiras + 1)`
  - Recálculo automático ao alterar qualquer parâmetro

### 3.3 Gerador de Geometria Paramétrica
- Criar `src/lib/parametricGeometry.ts`:
  - Gera `THREE.Group` a partir de `ParametricModule`
  - Cada peça (lateral, topo, base, prateleira) como mesh individual com metadata
  - Aplica materiais do catálogo (cor_caixa, cor_porta, etc.)

### 3.4 Componente de Edição
- Criar `src/components/smartimport/ParametricEditor.tsx`:
  - Painel lateral com sliders para dimensões (L × A × P)
  - Controles para adicionar/remover prateleiras, gavetas, portas
  - Preview 3D em tempo real usando o gerador de geometria
  - Drag para ajuste manual de posição de prateleiras

### 3.5 Snap System
- Implementar snap de 10mm para movimentação de componentes internos
- Grid visual opcional no editor

---

## FASE 4 — Sistema de Bibliotecas Hierárquicas
**~3 arquivos modificados/criados**

### 4.1 Estrutura de Dados
- SQL: Criar tabela `module_categories`:
  ```
  id, tenant_id, parent_id (nullable), name, icon, sort_order
  ```
- Exemplos: Cozinha > Superiores, Dormitório > Roupeiros

### 4.2 Hook de Categorias
- Criar `src/hooks/useModuleCategories.ts` — CRUD de categorias com hierarquia

### 4.3 UI de Biblioteca com Árvore
- Refatorar `ModuleLibraryPanel.tsx`:
  - Adicionar sidebar com árvore de categorias (collapsible)
  - Filtrar módulos por categoria selecionada
  - Permitir salvar módulo paramétrico na biblioteca
  - Drag & drop para reorganizar

---

## FASE 5 — Integração com Orçamento em Tempo Real
**~2 arquivos modificados**

### 5.1 Lista de Peças do Builder
- Cada `ParametricModule` gera automaticamente:
  - Lista de peças (laterais, topo, base, prateleiras, portas)
  - Ferragens necessárias (dobradiças, corrediças, puxadores)
  - Materiais consumidos (m² de MDF, fita de borda)

### 5.2 Sync com SmartBudgetPanel
- Módulos paramétricos alimentam o mesmo `processObjects` do budget engine
- Atualização em tempo real ao alterar dimensões

---

## FASE 6 — Integração com Simulador de Negociação
**~2 arquivos modificados**

### 6.1 Exportar Orçamento 3D para Simulador
- Em `SmartBudgetPanel.tsx` — adicionar botão "Enviar para Simulador"
- Preencher automaticamente os campos do `SimulatorPanel` com:
  - Nome do projeto → ambiente
  - Total final → valor
  - Quantidade de módulos → peças

---

## FASE 7 — IA para Render (Ajustes Automáticos)
**~1 arquivo modificado**

### 7.1 Auto-Lighting
- Em `GLBViewer.tsx` — após carregamento do modelo:
  - Analisar bounding box e materiais predominantes
  - Se >50% meshes são metálicas → preset "contrast" automático
  - Se modelo é pequeno (<2m³) → câmera mais próxima
  - Sugerir preset de iluminação baseado no conteúdo

---

## FASE 8 — SQL Necessário
Script para execução manual no Supabase:

```sql
-- Categorias hierárquicas para biblioteca de módulos
CREATE TABLE IF NOT EXISTS module_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  parent_id uuid REFERENCES module_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE module_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON module_categories
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT (auth.jwt()->'user_metadata'->>'tenant_id')::uuid));

-- Adicionar category_id à module_library
ALTER TABLE module_library ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES module_categories(id) ON DELETE SET NULL;

-- Dados paramétricos nos módulos
ALTER TABLE module_library ADD COLUMN IF NOT EXISTS parametric_data jsonb;
ALTER TABLE module_library ADD COLUMN IF NOT EXISTS internal_spans jsonb;
```

---

## Estimativa de Esforço

| Fase | Arquivos | Complexidade |
|------|----------|-------------|
| 1 — Performance | 5-8 | Alta |
| 2 — Touch | 2 | Média |
| 3 — Builder Paramétrico | 5 novos | Alta |
| 4 — Bibliotecas | 3 | Média |
| 5 — Orçamento RT | 2 | Baixa |
| 6 — Integração Simulador | 2 | Baixa |
| 7 — IA Render | 1 | Baixa |
| 8 — SQL | 1 script | Baixa |

**Total: ~20 arquivos, execução recomendada em 3-4 rodadas**

Recomendo executar Fases 1-2 primeiro (performance + touch), depois Fases 3-5 (builder + bibliotecas + orçamento), e por último Fases 6-8 (integrações + IA).

