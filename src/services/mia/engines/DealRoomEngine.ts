/**
 * DealRoom Engine — Routes DealRoom AI requests through MIA Core
 */

import { supabase } from "@/lib/supabaseClient";
import type { MIAEngineInterface, MIARequest, MIAResponse, MIAContextType } from "../types";

export class DealRoomEngine implements MIAEngineInterface {
  readonly engineType: MIAContextType = "dealroom";

  async process(request: MIARequest): Promise<MIAResponse> {
    try {
      const payload = request.payload || {};
      const messages = request.messages || [];

      // DealRoom uses vendazap-ai with messages format
      const body: Record<string, unknown> = {
        tenant_id: request.tenantId,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        ...payload,
      };

      const { data, error } = await supabase.functions.invoke("vendazap-ai", {
        body,
      });

      if (error) {
        return {
          content: "",
          error: error.message || "Erro ao conectar com IA DealRoom",
          engine: this.engineType,
        };
      }

      const content =
        data?.reply ||
        data?.choices?.[0]?.message?.content ||
        data?.resposta ||
        "";

      return {
        content,
        data: payload,
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
