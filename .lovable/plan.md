

## Plan: Contratos por Cargo, Catálogo, Funil Restrito e Automações Kanban

### 1. Contratos Fechados — Filtro por Cargo (ContractTrackingList.tsx)

Currently the projetista filter shows all sellers. For vendedor/projetista roles, auto-filter to only show their own contracts and hide the filter dropdown.

**Changes:**
- Import `useCurrentUser` hook
- Get `currentUser` and `cargoNome`
- If cargo is vendedor/projetista: set `filterProjetista` to the logged user's name, hide the projetista Select dropdown, and filter `trackings` server-side or client-side to only show rows where `projetista` or `vendedor` matches current user
- If cargo is administrador/gerente: keep existing behavior with "Todos" option and individual names

**File:** `src/components/dashboard/ContractTrackingList.tsx`

---

### 2. Catálogo de Produtos — Produtos não Aparecendo

The `useProductCatalog` hook uses `getTenantId()` from `tenantState.ts` (in-memory). If this is null at mount time, the query never runs. The product "Sofá 3 Lugares" exists in the database but won't load if `tenantId` is null.

**Fix:**
- In `useProductCatalog.ts`, fall back to `getResolvedTenantId()` (async) if `getTenantId()` returns null, similar to how other hooks work
- Ensure `loadProducts` and `loadSuppliers` re-run when tenantId becomes available
- Add `useEffect` with proper dependency on resolved tenant

**File:** `src/hooks/useProductCatalog.ts`

---

### 3. Funil de Captação — Restrições por Cargo (FunnelPanel.tsx)

For roles vendedor, projetista, gerente, liberador, conferente, técnico: make the following sections **read-only** (no edit/add/delete):
- Vídeo Promocional
- Carrossel de Imagens
- Textos da Página
- Cor Principal
- Benefícios Listados
- Faixas de Investimento
- Redes Sociais

Only administrador can modify these sections.

**Changes:**
- Import `useCurrentUser`
- Compute `isAdmin` from `cargoNome`
- Conditionally disable all inputs, hide add/remove buttons, hide Save button for non-admin roles
- Show a read-only info banner for non-admin users
- Keep Link Público and Métricas visible and functional for all roles

**File:** `src/components/FunnelPanel.tsx`

---

### 4. Kanban — Notificações de Cards Parados na Coluna "Novo"

Cards in "novo" column should emit notifications about how long they've been idle.

**Changes in `ClientsKanban.tsx`:**
- After computing `columnData`, check cards in `novo` column
- For each card, compute `daysInColumn = differenceInDays(now, client.updated_at)`
- If `daysInColumn >= 1`, trigger a toast notification on mount (throttled, once per session using a ref)
- Show the idle time on the KanbanCard for "novo" status cards

**File:** `src/components/ClientsKanban.tsx`

---

### 5. Kanban — Cards em "Em Negociação" sem Orçamento

Cards in "em_negociacao" without a simulation (`lastSims[client.id]` is undefined) should emit notification that they have no budget and are stalled.

Cards with a simulation: check `budgetValidityDays` expiration — if expired, auto-move to "expirado" column (this already works via line 211-212).

Cards without simulation AND no budget validity date: notify that they are without budgets.

**Changes:**
- Add notification logic in `useEffect` after `columnData` is computed
- For cards in `em_negociacao` without simulation: emit grouped notification
- Use a ref to avoid repeated notifications in the same session

**File:** `src/components/ClientsKanban.tsx`

---

### 6. Kanban — Auto-move Expirados → Perdidos após 3 dias

Cards in "expirado" column for more than 3 days should be automatically moved to "perdido" with a notification.

**Changes:**
- In the `columnData` computation or a separate `useEffect`, check cards in "expirado"
- For each, compute days since they became expired (using `updated_at` or `sim.created_at + budgetValidityDays`)
- If > 3 days in expirado, auto-update status to "perdido" via supabase and emit notification
- Update local state optimistically

**File:** `src/components/ClientsKanban.tsx`

---

### Technical Details

**Files to modify:**
- `src/components/dashboard/ContractTrackingList.tsx` — Role-based contract filtering
- `src/hooks/useProductCatalog.ts` — Fix tenant resolution for product loading
- `src/components/FunnelPanel.tsx` — Read-only mode for non-admin roles
- `src/components/ClientsKanban.tsx` — Notifications for idle cards + auto-move expirado→perdido

**No new files needed.**

**Dependencies:** `useCurrentUser` hook (already exists), `differenceInDays` from date-fns (already imported).

