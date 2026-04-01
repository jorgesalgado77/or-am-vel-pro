

## Plan: Melhorias no Simulador, Catálogo e Contratos

This is a large multi-part request covering 7 areas. Here is the structured plan:

---

### 1. Filtro por Período — Contratos Fechados (ContractTrackingList.tsx)

Add a date period filter dropdown to the contracts tracking list with these presets:
- **Mês Atual** (default), Mês Anterior, Últimos 3 Meses, Últimos 6 Meses, Ano Anterior, Personalizado (data início/fim)

**Files:** `src/components/dashboard/ContractTrackingList.tsx`
- Add state for period filter preset and custom date range
- Add a Select dropdown beside the existing filters
- Show DatePicker inputs when "Personalizado" is selected
- Filter `trackings` by `data_fechamento` using the selected range

---

### 2. Catálogo de Produtos — Visibilidade para Todos os Cargos + Detalhes do Produto

Currently the product list loads by `tenant_id`. The issue may be RLS or the query filtering. Will verify RLS and ensure all roles see products.

**Changes:**
- **ProductCatalog.tsx**: Add click handler on product row to open a detail modal
- **New component: `ProductDetailModal.tsx`**: Shows product image (with expand/zoom), name, dimensions, description, sale price, stock quantity, supplier name
- For **Vendedor** role: show only sale price, stock, supplier (hide cost/markup)
- Add image gallery with expand functionality

**Files:** `src/components/ProductCatalog.tsx`, new `src/components/catalog/ProductDetailModal.tsx`

---

### 3. Product Picker Modal — Maior e Mais Completo

Redesign `ProductPickerForSimulator.tsx`:
- Increase dialog size to `sm:max-w-3xl`
- Add filters: by name, environment, internal code, manufacturer code, stock status
- Show product image (main), name, dimensions, details, sale price, stock quantity
- Better card layout for each product with visual richness

**Files:** `src/components/simulator/ProductPickerForSimulator.tsx`

---

### 4. Listas Separadas — Ambientes Importados vs Produtos Adicionados

In the `SimulatorParametersForm.tsx`, split the current environments section into two distinct lists:
- **Ambientes Importados** (from file import — TXT/XML)
- **Produtos Adicionados** (from catalog picker)

Each list shows its own items with details and subtotals. Both subtotals sum to form the `Valor de Tela`.

**Files:** `src/components/simulator/SimulatorParametersForm.tsx`, `src/components/SimulatorPanel.tsx`
- Track `catalogProducts` as a separate state array (not merged into environments)
- Display two tables with individual totals
- Sum both for `valorTela`

---

### 5. Desconto Plus — Correções e Comportamento de Seleção

Currently `showPlus` controls visibility. Issues:
- Plus not appearing — check `showPlus` logic in `useSimulatorRates`
- When a payment option is selected, hide the others and show only the selected one with a checkbox to deselect

**Changes in `SimulatorParametersForm.tsx`:**
- Always show Desconto Plus section (remove `showPlus` gate or ensure it's always true)
- For Forma de Pagamento: when selected, collapse other options and show a checkbox to deselect (radio-like behavior with uncheck)
- Include Plus in AI strategy suggestions (`AIStrategyPanel.tsx` already uses `plusPercentual`)

---

### 6. Vincular Cliente — Listbox de Vendedores/Projetistas + Modal de Dados Mínimos

Redesign the `SimulatorClientPicker` section:
- Add a Listbox showing active Vendedores/Projetistas:
  - If user is Vendedor/Projetista: show only their own name (pre-selected)
  - If Admin/Gerente: show all active Vendedores/Projetistas
- After selecting the seller, show a modal to create a quick client with minimal data:
  - Nome, Telefone WhatsApp, Email, Data do Orçamento (auto today), Número do Orçamento (auto-generated)
- These data auto-populate the close sale contract

**Files:** `src/components/simulator/SimulatorClientPicker.tsx`, new `src/components/simulator/QuickClientModal.tsx`, `src/components/SimulatorPanel.tsx`

---

### 7. Fornecedores — Verificar Visibilidade

Ensure the suppliers tab in `ProductCatalog.tsx` loads and displays suppliers correctly for all roles. Check RLS on `suppliers` table.

---

### Technical Details

**New files to create:**
- `src/components/catalog/ProductDetailModal.tsx` — Product detail view with image expand
- `src/components/simulator/QuickClientModal.tsx` — Minimal client creation modal

**Files to modify:**
- `src/components/dashboard/ContractTrackingList.tsx` — Add period filter
- `src/components/ProductCatalog.tsx` — Add product click → detail modal, role-based field visibility
- `src/components/simulator/ProductPickerForSimulator.tsx` — Larger dialog, more filters, product images
- `src/components/simulator/SimulatorParametersForm.tsx` — Split lists, fix Plus visibility, payment selection UX
- `src/components/simulator/SimulatorClientPicker.tsx` — Add seller listbox + quick client modal
- `src/components/SimulatorPanel.tsx` — Separate catalog products state, wire new components
- `src/components/AIStrategyPanel.tsx` — Ensure Plus is included in strategy scenarios

**Database considerations:**
- Verify RLS on `products` and `suppliers` tables allows SELECT for all authenticated users with matching `tenant_id`
- No new tables needed; uses existing `products`, `suppliers`, `product_images`, `clients`

