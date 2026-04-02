/**
 * DealRoom Engine — Phase 1 placeholder
 */

import type { MIAEngineInterface, MIARequest, MIAResponse, MIAContextType } from "../types";

export class DealRoomEngine implements MIAEngineInterface {
  readonly engineType: MIAContextType = "dealroom";

  async process(request: MIARequest): Promise<MIAResponse> {
    return {
      type: "text",
      message: `[DealRoomEngine] Placeholder — mensagem recebida: "${request.message}"`,
      engine: this.engineType,
      provider: "openai",
    };
  }
}
