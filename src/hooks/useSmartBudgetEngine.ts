import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import type { ProjectObject, ModuleLibraryItem } from "@/hooks/useSmartImport3D";

// ==================== TYPES ====================

export interface PricingRule {
  id: string;
  company_id: string;
  type: "module" | "accessory" | "ferragem";
  markup: number;
  margin: number;
}

export interface EnrichedBudgetItem {
  id: string;
  name: string;
  identified_type: "module" | "accessory" | "ferragem" | "undefined";
  linked_module_id: string | null;
  linked_module_name: string | null;
  quantity: number;
  unit_cost: number;
  markup: number;
  margin: number;
  final_value: number;
  suggested_type: "module" | "accessory" | "ferragem" | "undefined" | null;
  suggested_module: ModuleLibraryItem | null;
}

export interface BudgetSummary {
  items: EnrichedBudgetItem[];
  modules_total: number;
  accessories_total: number;
  ferragens_total: number;
  cost_total: number;
  margin_total: number;
  final_total: number;
  item_count: number;
}

// ==================== AUTO-CLASSIFICATION ====================

const MODULE_KEYWORDS = [
  "aereo", "aéreo", "base", "torre", "bancada", "gabinete", "painel",
  "estante", "prateleira", "nicho", "tamponamento", "armario", "armário",
  "balcao", "balcão", "cozinha", "banheiro", "lavanderia", "closet",
  "rack", "mesa", "criado", "comoda", "cômoda", "guarda-roupa",
];

const ACCESSORY_KEYWORDS = [
  "puxador", "corrediça", "corrediça", "dobradica", "dobradiça", "rodizio",
  "rodízio", "pe", "pé", "acabamento", "perfil", "fita", "borda",
  "cantoneira", "suporte", "trilho", "rodape", "rodapé",
];

const FERRAGEM_KEYWORDS = [
  "parafuso", "bucha", "prego", "cola", "silicone", "rebite",
  "arruela", "porca", "chapa", "cantoneira", "mão-francesa",
  "gancho", "presilha", "grampo", "fixador",
];

function suggestType(name: string): "module" | "accessory" | "ferragem" | "undefined" {
  const lower = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (MODULE_KEYWORDS.some(k => lower.includes(k.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) return "module";
  if (ACCESSORY_KEYWORDS.some(k => lower.includes(k.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) return "accessory";
  if (FERRAGEM_KEYWORDS.some(k => lower.includes(k.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) return "ferragem";
  return "undefined";
}

function suggestModule(name: string, library: ModuleLibraryItem[]): ModuleLibraryItem | null {
  if (!library.length) return null;
  const lower = name.toLowerCase();
  
  // Exact match
  const exact = library.find(m => m.name.toLowerCase() === lower);
  if (exact) return exact;
  
  // Partial match - find best
  let best: ModuleLibraryItem | null = null;
  let bestScore = 0;
  
  for (const mod of library) {
    const modLower = mod.name.toLowerCase();
    const words = modLower.split(/\s+/);
    const score = words.filter(w => lower.includes(w) && w.length > 2).length;
    if (score > bestScore) {
      bestScore = score;
      best = mod;
    }
  }
  
  return bestScore >= 1 ? best : null;
}

// ==================== HOOK ====================

export function useSmartBudgetEngine(tenantId: string | null) {
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [budgetItems, setBudgetItems] = useState<EnrichedBudgetItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Load pricing rules
  const loadPricingRules = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("pricing_rules" as any)
      .select("*")
      .eq("company_id", tenantId);
    setPricingRules((data as any[]) || []);
  }, [tenantId]);

  // Save pricing rule
  const savePricingRule = useCallback(async (rule: Omit<PricingRule, "id" | "company_id">) => {
    if (!tenantId) return null;
    
    // Upsert by type
    const existing = pricingRules.find(r => r.type === rule.type);
    if (existing) {
      const { error } = await supabase
        .from("pricing_rules" as any)
        .update({ markup: rule.markup, margin: rule.margin })
        .eq("id", existing.id);
      if (error) { toast.error("Erro ao salvar regra"); return null; }
    } else {
      const { error } = await supabase
        .from("pricing_rules" as any)
        .insert({ company_id: tenantId, ...rule });
      if (error) { toast.error("Erro ao criar regra"); return null; }
    }
    
    toast.success("Regra de preço salva!");
    loadPricingRules();
    return true;
  }, [tenantId, pricingRules, loadPricingRules]);

  // Get rule for type
  const getRuleForType = useCallback((type: string): { markup: number; margin: number } => {
    const rule = pricingRules.find(r => r.type === type);
    return rule ? { markup: rule.markup, margin: rule.margin } : { markup: 0, margin: 30 };
  }, [pricingRules]);

  // Process objects into budget items with AI suggestions
  const processObjects = useCallback((objects: ProjectObject[], library: ModuleLibraryItem[]) => {
    const items: EnrichedBudgetItem[] = objects.map(obj => {
      const sType = suggestType(obj.name);
      const sMod = suggestModule(obj.name, library);
      const rule = getRuleForType(sType === "undefined" ? "module" : sType);
      
      const identifiedType = (obj as any).identified_type || sType;
      const linkedModuleId = (obj as any).linked_module_id || sMod?.id || null;
      const quantity = (obj as any).quantity || 1;
      const unitCost = (obj as any).unit_cost || sMod?.cost || obj.cost || 0;
      const finalValue = unitCost * quantity * (1 + rule.margin / 100);

      return {
        id: obj.id,
        name: obj.name,
        identified_type: identifiedType,
        linked_module_id: linkedModuleId,
        linked_module_name: sMod?.name || null,
        quantity,
        unit_cost: unitCost,
        markup: rule.markup,
        margin: rule.margin,
        final_value: finalValue,
        suggested_type: sType !== identifiedType ? sType : null,
        suggested_module: sMod,
      };
    });

    setBudgetItems(items);
    return items;
  }, [getRuleForType]);

  // Update a single item
  const updateItem = useCallback(async (
    itemId: string,
    updates: Partial<Pick<EnrichedBudgetItem, "identified_type" | "linked_module_id" | "quantity" | "unit_cost">>
  ) => {
    const { error } = await supabase
      .from("project_objects" as any)
      .update({
        ...(updates.identified_type && { identified_type: updates.identified_type, type: updates.identified_type }),
        ...(updates.linked_module_id !== undefined && { linked_module_id: updates.linked_module_id }),
        ...(updates.quantity !== undefined && { quantity: updates.quantity }),
        ...(updates.unit_cost !== undefined && { unit_cost: updates.unit_cost }),
      })
      .eq("id", itemId);

    if (error) {
      toast.error("Erro ao atualizar item");
      return false;
    }

    // Update local state
    setBudgetItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const updated = { ...item, ...updates };
      const rule = getRuleForType(updated.identified_type === "undefined" ? "module" : updated.identified_type);
      updated.margin = rule.margin;
      updated.markup = rule.markup;
      updated.final_value = (updated.unit_cost || 0) * (updated.quantity || 1) * (1 + rule.margin / 100);
      return updated;
    }));

    return true;
  }, [getRuleForType]);

  // Accept AI suggestion
  const acceptSuggestion = useCallback(async (itemId: string) => {
    const item = budgetItems.find(i => i.id === itemId);
    if (!item) return;

    const updates: any = {};
    if (item.suggested_type) updates.identified_type = item.suggested_type;
    if (item.suggested_module) {
      updates.linked_module_id = item.suggested_module.id;
      updates.unit_cost = item.suggested_module.cost;
    }

    await updateItem(itemId, updates);
    toast.success("Sugestão aplicada!");
  }, [budgetItems, updateItem]);

  // Budget summary
  const summary = useMemo((): BudgetSummary => {
    const modules = budgetItems.filter(i => i.identified_type === "module");
    const accessories = budgetItems.filter(i => i.identified_type === "accessory");
    const ferragens = budgetItems.filter(i => i.identified_type === "ferragem");

    const calcTotal = (items: EnrichedBudgetItem[]) => items.reduce((s, i) => s + i.final_value, 0);
    const calcCost = (items: EnrichedBudgetItem[]) => items.reduce((s, i) => s + (i.unit_cost * i.quantity), 0);

    const costTotal = calcCost(budgetItems);
    const finalTotal = calcTotal(budgetItems);

    return {
      items: budgetItems,
      modules_total: calcTotal(modules),
      accessories_total: calcTotal(accessories),
      ferragens_total: calcTotal(ferragens),
      cost_total: costTotal,
      margin_total: finalTotal - costTotal,
      final_total: finalTotal,
      item_count: budgetItems.length,
    };
  }, [budgetItems]);

  return {
    pricingRules,
    budgetItems,
    summary,
    loading,
    loadPricingRules,
    savePricingRule,
    processObjects,
    updateItem,
    acceptSuggestion,
    getRuleForType,
  };
}
