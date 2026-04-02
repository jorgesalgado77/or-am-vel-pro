/**
 * Argument Engine — Routes argument improvement requests through MIA Core
 */

import { supabase } from "@/lib/supabaseClient";
import type { MIAEngineInterface, MIARequest, MIAResponse, MIAContextType } from "../types";

export class ArgumentEngine implements MIAEngineInterface {
  readonly engineType: MIAContextType = "argument";

  async process(request: MIARequest): Promise<MIAResponse> {
    try {
      const payload = request.payload || {};
      const action = (payload.action as string) || "improve_argument";

      const body: Record<string, unknown> = {
        prompt: request.input || payload.prompt || "",
        action,
        tenant_id: request.tenantId,
      };

      const { data, error } = await supabase.functions.invoke("improve-argument", {
        body,
      });

      if (error) {
        return {
          content: "",
          error: error.message || "Erro ao melhorar argumento",
          engine: this.engineType,
        };
      }

      return {
        content: data?.content || "",
        engine: this.engineType,
        provider: "openai",
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
