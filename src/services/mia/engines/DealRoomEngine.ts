/**
 * DealRoom Engine — Routes DealRoom AI requests through MIA Core
 * Phase 2: Real edge function integration.
 */

import { supabase } from "@/lib/supabaseClient";
import type { MIAEngineInterface, MIARequest, MIAResponse, MIAContextType } from "../types";

export class DealRoomEngine implements MIAEngineInterface {
  readonly engineType: MIAContextType = "dealroom";

  async process(request: MIARequest): Promise<MIAResponse> {
    try {
      const messages = request.messages || [];

      const body: Record<string, unknown> = {
        tenant_id: request.tenantId,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        ...request.metadata,
      };

      const { data, error } = await supabase.functions.invoke("vendazap-ai", { body });

      if (error) {
        return {
          type: "text",
          message: "",
          error: error.message || "Erro ao conectar com IA DealRoom",
          engine: this.engineType,
        };
      }

      const message =
        data?.reply ||
        data?.choices?.[0]?.message?.content ||
        data?.resposta ||
        "";

      return {
        type: "text",
        message,
        data: data as Record<string, unknown> | undefined,
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
