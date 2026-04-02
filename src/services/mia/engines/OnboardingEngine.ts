/**
 * Onboarding Engine — Routes onboarding AI requests through MIA Core
 * Phase 2: Real edge function integration.
 */

import { supabase } from "@/lib/supabaseClient";
import type { MIAEngineInterface, MIARequest, MIAResponse, MIAContextType } from "../types";

export class OnboardingEngine implements MIAEngineInterface {
  readonly engineType: MIAContextType = "onboarding";

  async process(request: MIARequest): Promise<MIAResponse> {
    try {
      const messages = request.messages || [];
      const action = (request.metadata?.action as string) || "chat";

      const body: Record<string, unknown> = {
        tenant_id: request.tenantId,
        action,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        ...request.metadata,
      };

      const { data, error } = await supabase.functions.invoke("onboarding-ai", { body });

      if (error) {
        return {
          type: "text",
          message: "",
          error: error.message || "Erro ao conectar com Mia Onboarding",
          engine: this.engineType,
        };
      }

      // Handle different action responses
      if (action === "run_tests" || action === "configure_vendazap" || action === "suggest_first_project") {
        return {
          type: "action",
          message: "",
          data: data as Record<string, unknown>,
          engine: this.engineType,
        };
      }

      const message =
        data?.reply ||
        data?.choices?.[0]?.message?.content ||
        "";

      return {
        type: "text",
        message,
        data: {
          context: data?.context as Record<string, unknown> | undefined,
          action: data?.action as string | undefined,
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
