/**
 * VendaZap Engine — Routes vendazap AI requests through MIA Core
 */

import { supabase } from "@/lib/supabaseClient";
import type { MIAEngineInterface, MIARequest, MIAResponse, MIAContextType } from "../types";

export class VendaZapEngine implements MIAEngineInterface {
  readonly engineType: MIAContextType = "vendazap";

  async process(request: MIARequest): Promise<MIAResponse> {
    try {
      const payload = request.payload || {};

      // Build the body for vendazap-ai edge function
      const body: Record<string, unknown> = {
        tenant_id: request.tenantId,
        ...payload,
      };

      // If messages are provided, use them directly
      if (request.messages && request.messages.length > 0) {
        body.messages = request.messages;
      }

      // If simple input, use as mensagem_cliente
      if (request.input && !body.mensagem_cliente) {
        body.mensagem_cliente = request.input;
      }

      const { data, error } = await supabase.functions.invoke("vendazap-ai", {
        body,
      });

      if (error) {
        return {
          content: "",
          error: error.message || "Erro ao conectar com VendaZap AI",
          engine: this.engineType,
        };
      }

      // Handle different response formats from vendazap-ai
      const content =
        data?.resposta ||
        data?.reply ||
        data?.choices?.[0]?.message?.content ||
        "";

      return {
        content,
        data: {
          disc_profile: data?.disc_profile,
          intent: data?.intent,
          closing_score: data?.closing_score,
          temperature: data?.temperature,
          suggested_response: data?.suggested_response,
        },
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
