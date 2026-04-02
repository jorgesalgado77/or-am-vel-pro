/**
 * Onboarding Engine — Routes onboarding AI requests through MIA Core
 */

import { supabase } from "@/lib/supabaseClient";
import type { MIAEngineInterface, MIARequest, MIAResponse, MIAContextType } from "../types";

export class OnboardingEngine implements MIAEngineInterface {
  readonly engineType: MIAContextType = "onboarding";

  async process(request: MIARequest): Promise<MIAResponse> {
    try {
      const payload = request.payload || {};
      const messages = request.messages || [];

      const body: Record<string, unknown> = {
        tenant_id: request.tenantId,
        action: payload.action || "chat",
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        ...payload,
      };

      const { data, error } = await supabase.functions.invoke("onboarding-ai", {
        body,
      });

      if (error) {
        return {
          content: "",
          error: error.message || "Erro ao conectar com Mia Onboarding",
          engine: this.engineType,
        };
      }

      // Handle different actions
      if (payload.action === "run_tests") {
        return {
          content: "",
          data: {
            results: data?.results,
            allPassed: data?.allPassed,
            criticalPassed: data?.criticalPassed,
            completedSteps: data?.completedSteps,
            capabilities: data?.capabilities,
          },
          engine: this.engineType,
        };
      }

      if (payload.action === "configure_vendazap") {
        return {
          content: "",
          data: {
            success: data?.success,
            tom: data?.tom,
            prompt_preview: data?.prompt_preview,
          },
          engine: this.engineType,
        };
      }

      if (payload.action === "suggest_first_project") {
        return {
          content: "",
          data: {
            suggestions: data?.suggestions,
            storeType: data?.storeType,
          },
          engine: this.engineType,
        };
      }

      const content =
        data?.reply ||
        data?.choices?.[0]?.message?.content ||
        "";

      return {
        content,
        data: {
          context: data?.context,
          action: data?.action,
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
