/**
 * VendaZap Engine — Routes vendazap AI requests through MIA Core
 * Phase 1: Placeholder — no actual API calls yet.
 */

import type { MIAEngineInterface, MIARequest, MIAResponse, MIAContextType } from "../types";

export class VendaZapEngine implements MIAEngineInterface {
  readonly engineType: MIAContextType = "vendazap";

  async process(request: MIARequest): Promise<MIAResponse> {
    // Phase 1: Placeholder response — will integrate with vendazap-ai edge function in Phase 2+
    return {
      type: "text",
      message: `[VendaZapEngine] Placeholder — mensagem recebida: "${request.message}"`,
      engine: this.engineType,
      provider: "openai",
    };
  }
}
