/**
 * Cashflow Engine — Routes financial AI analysis through MIA Core
 * Phase 2: Real edge function integration.
 */

import { supabase } from "@/lib/supabaseClient";
import type { MIAEngineInterface, MIARequest, MIAResponse, MIAContextType } from "../types";

export class CashflowEngine implements MIAEngineInterface {
  readonly engineType: MIAContextType = "cashflow";

  async process(request: MIARequest): Promise<MIAResponse> {
    try {
      const body: Record<string, unknown> = {
        resumo_financeiro: (request.metadata?.resumo_financeiro as string) || request.message || "",
      };

      const { data, error } = await supabase.functions.invoke("cashflow-ai", { body });

      if (error) {
        return {
          type: "text",
          message: "",
          error: error.message || "Erro ao conectar com IA Financeira",
          engine: this.engineType,
        };
      }

      return {
        type: "text",
        message: (data?.analise as string) || "",
        engine: this.engineType,
        provider: "lovable",
      };
    } catch (e) {
      return {
        type: "text",
        message: "",
        error: e instanceof Error ? e.message : "Erro desconhecido",
        engine: this.engineType,
      };
    }
  }
}
