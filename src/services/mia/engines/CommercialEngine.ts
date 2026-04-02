/**
 * Commercial Engine — Routes commercial/director AI requests through MIA Core
 * Phase 2: Real edge function integration.
 */

import { supabase } from "@/lib/supabaseClient";
import type { MIAEngineInterface, MIARequest, MIAResponse, MIAContextType } from "../types";

export class CommercialEngine implements MIAEngineInterface {
  readonly engineType: MIAContextType = "commercial";

  async process(request: MIARequest): Promise<MIAResponse> {
    try {
      const messages = request.messages || [];
      const action = (request.metadata?.action as string) || "chat";

      const body: Record<string, unknown> = {
        tenant_id: request.tenantId,
        action,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        metrics_summary: request.metadata?.metrics_summary,
        preferred_provider: request.metadata?.preferred_provider,
        ...request.metadata,
      };

      const { data, error } = await supabase.functions.invoke("commercial-ai", { body });

      if (error) {
        return {
          type: "text",
          message: "",
          error: error.message || "Erro ao conectar com IA Comercial",
          engine: this.engineType,
        };
      }

      // Handle metadata-only responses
      if (action === "get_available_providers" || action === "check_alerts") {
        return {
          type: "action",
          message: "",
          data: data as Record<string, unknown>,
          engine: this.engineType,
        };
      }

      // For streaming responses, data might be the raw stream
      const message =
        data?.reply ||
        data?.choices?.[0]?.message?.content ||
        (typeof data === "string" ? data : "");

      return {
        type: "text",
        message,
        data: data as Record<string, unknown> | undefined,
        engine: this.engineType,
        provider: (request.metadata?.preferred_provider as string) || "openai",
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
