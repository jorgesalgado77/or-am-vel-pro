/**
 * VendaZap Engine — Routes vendazap AI requests through MIA Core
 * Phase 2: Real edge function integration with structured response.
 */

import { supabase } from "@/lib/supabaseClient";
import type { MIAEngineInterface, MIARequest, MIAResponse, MIAContextType } from "../types";

export class VendaZapEngine implements MIAEngineInterface {
  readonly engineType: MIAContextType = "vendazap";

  async process(request: MIARequest): Promise<MIAResponse> {
    try {
      const body: Record<string, unknown> = {
        tenant_id: request.tenantId,
        ...request.metadata,
      };

      // Use messages if provided (multi-turn), otherwise use message
      if (request.messages && request.messages.length > 0) {
        body.messages = request.messages.map((m) => ({ role: m.role, content: m.content }));
      }

      if (request.message && !body.mensagem_cliente) {
        body.mensagem_cliente = request.message;
      }

      const { data, error } = await supabase.functions.invoke("vendazap-ai", { body });

      if (error) {
        return {
          type: "text",
          message: "",
          error: error.message || "Erro ao conectar com VendaZap AI",
          engine: this.engineType,
        };
      }

      const message =
        data?.resposta ||
        data?.reply ||
        data?.choices?.[0]?.message?.content ||
        "";

      return {
        type: "text",
        message,
        data: {
          disc_profile: data?.disc_profile as string | undefined,
          intent: data?.intent as string | undefined,
          closing_score: data?.closing_score as number | undefined,
          temperature: data?.temperature as string | undefined,
          suggested_response: data?.suggested_response as string | undefined,
          raw: data as Record<string, unknown> | undefined,
        },
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
