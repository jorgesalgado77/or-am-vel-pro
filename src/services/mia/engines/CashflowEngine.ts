/**
 * Cashflow Engine — Routes financial AI analysis through MIA Core
 */

import { supabase } from "@/lib/supabaseClient";
import type { MIAEngineInterface, MIARequest, MIAResponse, MIAContextType } from "../types";

export class CashflowEngine implements MIAEngineInterface {
  readonly engineType: MIAContextType = "cashflow";

  async process(request: MIARequest): Promise<MIAResponse> {
    try {
      const payload = request.payload || {};

      const body: Record<string, unknown> = {
        resumo_financeiro: payload.resumo_financeiro || request.input || "",
      };

      const { data, error } = await supabase.functions.invoke("cashflow-ai", {
        body,
      });

      if (error) {
        return {
          content: "",
          error: error.message || "Erro ao conectar com IA Financeira",
          engine: this.engineType,
        };
      }

      return {
        content: data?.analise || "",
        engine: this.engineType,
        provider: "lovable",
      };
    } catch (e) {
      return {
        content: "",
        error: e instanceof Error ? e.message : "Erro desconhecido",
        engine: this.engineType,
      };
    }
  }
}
