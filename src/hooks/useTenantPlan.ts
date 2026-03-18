import { useState, useEffect, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";

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
};

// Features blocked per plan
const PLAN_FEATURES: Record<string, { configuracoes: boolean; desconto3: boolean; plus: boolean; contratos: boolean }> = {
  trial: { configuracoes: true, desconto3: true, plus: true, contratos: true },
  basico: { configuracoes: true, desconto3: false, plus: false, contratos: false },
  premium: { configuracoes: true, desconto3: true, plus: true, contratos: true },
};

export function useTenantPlan() {
  const [plan, setPlan] = useState<TenantPlan>(DEFAULT_PLAN);
  const [loading, setLoading] = useState(true);

  const fetchPlan = async () => {
    // Get tenant linked to current company_settings
    const { data: settings } = await supabase
      .from("company_settings")
      .select("tenant_id")
      .limit(1)
      .single();

    const tenantId = (settings as any)?.tenant_id;
    if (!tenantId) {
      // No tenant linked, assume trial/full access
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
    });
    setLoading(false);
  };

  useEffect(() => { fetchPlan(); }, []);

  const isFeatureAllowed = (feature: keyof typeof PLAN_FEATURES["trial"]): boolean => {
    if (plan.expirado) return false;
    const features = PLAN_FEATURES[plan.plano] || PLAN_FEATURES.trial;
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
