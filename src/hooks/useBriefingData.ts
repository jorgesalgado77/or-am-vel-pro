/**
 * Hook to fetch briefing data for a client — used for simulator pre-fill integration.
 */
import { useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface BriefingPreFillData {
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  clientProfession: string;
  environments: string[];
  constructionStage: string;
  budgetExpectation: string;
  paymentType: string;
  purchaseTimeline: string;
  descricaoAmbientes: string;
  quantidadeAmbientes: number;
}

export function useBriefingData() {
  const fetchBriefingForClient = useCallback(async (clientId: string): Promise<BriefingPreFillData | null> => {
    const { data } = await supabase
      .from("client_briefings" as any)
      .select("responses")
      .eq("client_id", clientId)
      .maybeSingle();

    if (!data) return null;

    const r = (data as any).responses as Record<string, any>;
    if (!r) return null;

    const environments: string[] = Array.isArray(r.environments) ? r.environments : [];
    const otherEnv = r.environments_other ? String(r.environments_other).trim() : "";
    const allEnvs = otherEnv ? [...environments, otherEnv] : environments;

    return {
      clientName: r.client_1_name || "",
      clientPhone: r.client_1_phone || "",
      clientEmail: r.client_1_email || "",
      clientProfession: r.client_1_profession || "",
      environments: allEnvs,
      constructionStage: r.construction_stage || "",
      budgetExpectation: r.budget_expectation || "",
      paymentType: r.payment_type || "",
      purchaseTimeline: r.purchase_timeline || "",
      descricaoAmbientes: allEnvs.join(", "),
      quantidadeAmbientes: allEnvs.length,
    };
  }, []);

  return { fetchBriefingForClient };
}
