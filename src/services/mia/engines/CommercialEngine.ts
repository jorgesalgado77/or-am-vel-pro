/**
 * Commercial Engine — Phase 1 placeholder
 */

import type { MIAEngineInterface, MIARequest, MIAResponse, MIAContextType } from "../types";

export class CommercialEngine implements MIAEngineInterface {
  readonly engineType: MIAContextType = "commercial";

  async process(request: MIARequest): Promise<MIAResponse> {
    return {
      type: "text",
      message: `[CommercialEngine] Placeholder — mensagem recebida: "${request.message}"`,
      engine: this.engineType,
      provider: "openai",
    };
  }
}
