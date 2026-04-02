/**
 * Onboarding Engine — Phase 1 placeholder
 */

import type { MIAEngineInterface, MIARequest, MIAResponse, MIAContextType } from "../types";

export class OnboardingEngine implements MIAEngineInterface {
  readonly engineType: MIAContextType = "onboarding";

  async process(request: MIARequest): Promise<MIAResponse> {
    return {
      type: "text",
      message: `[OnboardingEngine] Placeholder — mensagem recebida: "${request.message}"`,
      engine: this.engineType,
      provider: "openai",
    };
  }
}
