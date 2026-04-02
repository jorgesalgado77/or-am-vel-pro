/**
 * Argument Engine — Routes argument improvement requests through MIA Core
 * Phase 2: Real edge function integration.
 */

import { supabase } from "@/lib/supabaseClient";
import type { MIAEngineInterface, MIARequest, MIAResponse, MIAContextType } from "../types";

export class ArgumentEngine implements MIAEngineInterface {
  readonly engineType: MIAContextType = "argument";

  async process(request: MIARequest): Promise<MIAResponse> {
    try {
      const action = (request.metadata?.action as string) || "improve_argument";

      const body: Record<string, unknown> = {
        prompt: request.message || (request.metadata?.prompt as string) || "",
        action,
        tenant_id: request.tenantId,
      };

      const { data, error } = await supabase.functions.invoke("improve-argument", { body });

      if (error) {
        return {
          type: "text",
          message: "",
          error: error.message || "Erro ao melhorar argumento",
          engine: this.engineType,
        };
      }

      return {
        type: "text",
        message: (data?.content as string) || "",
        engine: this.engineType,
        provider: "openai",
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
