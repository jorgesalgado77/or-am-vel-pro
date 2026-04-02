/**
 * Commercial Engine — Routes commercial/director AI requests through MIA Core
 * Supports streaming responses.
 */

import { supabase } from "@/lib/supabaseClient";
import type { MIAEngineInterface, MIARequest, MIAResponse, MIAContextType } from "../types";

export class CommercialEngine implements MIAEngineInterface {
  readonly engineType: MIAContextType = "commercial";

  async process(request: MIARequest): Promise<MIAResponse> {
    try {
      const payload = request.payload || {};
      const messages = request.messages || [];

      const body: Record<string, unknown> = {
        tenant_id: request.tenantId,
        action: payload.action || "chat",
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        metrics_summary: payload.metrics_summary,
        preferred_provider: payload.preferred_provider,
        ...payload,
      };

      const { data, error } = await supabase.functions.invoke("commercial-ai", {
        body,
      });

      if (error) {
        return {
          content: "",
          error: error.message || "Erro ao conectar com IA Comercial",
          engine: this.engineType,
        };
      }

      // Handle different action types
      if (payload.action === "get_available_providers") {
        return {
          content: "",
          data: {
            providers: data?.providers,
            default_provider: data?.default_provider,
          },
          engine: this.engineType,
        };
      }

      if (payload.action === "check_alerts") {
        return {
          content: "",
          data: {
            alerts: data?.alerts,
            providers: data?.providers,
            connected: data?.connected,
          },
          engine: this.engineType,
        };
      }

      // For streaming responses, the raw data contains the stream
      // The component handles SSE parsing
      const content =
        data?.reply ||
        data?.choices?.[0]?.message?.content ||
        (typeof data === "string" ? data : "");

      return {
        content,
        data,
        engine: this.engineType,
        provider: payload.preferred_provider as string || "openai",
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
