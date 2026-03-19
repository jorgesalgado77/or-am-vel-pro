import { useState, useEffect, createContext, useContext } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface TenantPlan {
  plano: string;
  plano_periodo: string;
  max_usuarios: number;
  ativo: boolean;
  expirado: boolean;
  dias_restantes: number;
  trial_fim: string | null;
  assinatura_fim: string | null;
  recursos_vip: Record<string, boolean>;
}

const DEFAULT_PLAN: TenantPlan = {
  plano: "trial",
  plano_periodo: "mensal",
  max_usuarios: 999,
  ativo: true,
  expirado: false,
  dias_restantes: 7,
  trial_fim: null,
  assinatura_fim: null,
  recursos_vip: { ocultar_indicador: false },
};

// Fallback features if DB fetch fails
const FALLBACK_FEATURES: Record<string, Record<string, boolean>> = {
  trial: { configuracoes: true, desconto3: true, plus: true, contratos: true, ocultar_indicador: false, deal_room: false },
  basico: { configuracoes: true, desconto3: false, plus: false, contratos: false, ocultar_indicador: false, deal_room: true },
  premium: { configuracoes: true, desconto3: true, plus: true, contratos: true, ocultar_indicador: false, deal_room: true },
};

// Cache for plan features fetched from DB
let planFeaturesCache: Record<string, Record<string, boolean>> | null = null;

async function fetchPlanFeatures(): Promise<Record<string, Record<string, boolean>>> {
  if (planFeaturesCache) return planFeaturesCache;
  
  const { data } = await supabase
    .from("subscription_plans" as any)
    .select("slug, funcionalidades")
    .eq("ativo", true);
  
  if (data && data.length > 0) {
    const map: Record<string, Record<string, boolean>> = {};
    (data as any[]).forEach(p => {
      map[p.slug] = p.funcionalidades || {};
    });
    planFeaturesCache = map;
    return map;
  }
  return FALLBACK_FEATURES;
}

// Subscribe to realtime changes to invalidate cache
const realtimeChannel = supabase
  .channel("plan-features-cache")
  .on("postgres_changes", { event: "*", schema: "public", table: "subscription_plans" }, () => {
    planFeaturesCache = null; // Invalidate cache
  })
  .subscribe();

export function useTenantPlan() {
  const [plan, setPlan] = useState<TenantPlan>(DEFAULT_PLAN);
  const [loading, setLoading] = useState(true);
  const [planFeatures, setPlanFeatures] = useState<Record<string, Record<string, boolean>>>(FALLBACK_FEATURES);

  const fetchPlan = async () => {
    // Fetch plan features from DB
    const features = await fetchPlanFeatures();
    setPlanFeatures(features);

    // Get tenant linked to current company_settings
    const { data: settings } = await supabase
      .from("company_settings")
      .select("tenant_id")
      .limit(1)
      .single();

    const tenantId = (settings as any)?.tenant_id;
    if (!tenantId) {
      setLoading(false);
      return;
    }

    const { data: tenant } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", tenantId)
      .single();

    if (!tenant) {
      setLoading(false);
      return;
    }

    const t = tenant as any;
    const now = new Date();
    let expirado = false;
    let diasRestantes = 0;

    if (t.plano === "trial") {
      const trialFim = new Date(t.trial_fim);
      expirado = now > trialFim;
      diasRestantes = Math.max(0, Math.ceil((trialFim.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    } else if (t.assinatura_fim) {
      const assFim = new Date(t.assinatura_fim);
      expirado = now > assFim;
      diasRestantes = Math.max(0, Math.ceil((assFim.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }

    setPlan({
      plano: t.plano,
      plano_periodo: t.plano_periodo,
      max_usuarios: t.max_usuarios,
      ativo: t.ativo,
      expirado,
      dias_restantes: diasRestantes,
      trial_fim: t.trial_fim,
      assinatura_fim: t.assinatura_fim,
      recursos_vip: (t.recursos_vip as Record<string, boolean>) || { ocultar_indicador: false },
    });
    setLoading(false);
  };

  useEffect(() => { fetchPlan(); }, []);

  const isFeatureAllowed = (feature: string): boolean => {
    if (plan.expirado) return false;
    // Check tenant-level VIP overrides first
    if (plan.recursos_vip && plan.recursos_vip[feature] !== undefined) {
      return plan.recursos_vip[feature];
    }
    const features = planFeatures[plan.plano] || FALLBACK_FEATURES[plan.plano] || FALLBACK_FEATURES.trial;
    return features[feature] ?? false;
  };

  const canAddUser = (currentUserCount: number): boolean => {
    if (plan.expirado) return false;
    return currentUserCount < plan.max_usuarios;
  };

  return { plan, loading, isFeatureAllowed, canAddUser, refresh: fetchPlan };
}

export const TenantPlanContext = createContext<ReturnType<typeof useTenantPlan>>({
  plan: DEFAULT_PLAN,
  loading: true,
  isFeatureAllowed: () => true,
  canAddUser: () => true,
  refresh: async () => {},
});

export function useTenantPlanContext() {
  return useContext(TenantPlanContext);
}
