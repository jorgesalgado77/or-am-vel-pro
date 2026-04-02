/**
 * MIA Adapter — Bridge between existing code and MIA Core.
 * 
 * Provides a simple function interface that wraps MIA Orchestrator,
 * allowing existing modules to route through MIA with minimal changes.
 * 
 * IMPORTANT: Does NOT replace existing calls — used alongside them
 * with fallback to guarantee zero breakage.
 */

import { getMIAOrchestrator } from "./MIAOrchestrator";
import type { MIAOrigin, MIAContextType, MIAResponse, MIAMessage } from "./types";

/** Simplified adapter params for easy integration */
export interface MIAAdapterParams {
  tenant_id: string;
  user_id: string;
  message: string;
  origin: MIAOrigin;
  context?: MIAContextType;
  messages?: MIAMessage[];
  metadata?: Record<string, unknown>;
  useMemory?: boolean;
}

/**
 * Adapter function — translates simple params to MIARequest
 * and routes through the Orchestrator.
 */
export async function miaGenerateResponse(params: MIAAdapterParams): Promise<MIAResponse> {
  const orchestrator = getMIAOrchestrator();

  // Auto-detect context from origin if not specified
  const context = params.context || originToContext(params.origin);

  return orchestrator.handleRequest({
    tenantId: params.tenant_id,
    userId: params.user_id,
    message: params.message,
    origin: params.origin,
    context,
    messages: params.messages,
    metadata: params.metadata,
    useMemory: params.useMemory ?? true,
  });
}

/** Map origin to default context engine */
function originToContext(origin: MIAOrigin): MIAContextType {
  switch (origin) {
    case "chat":
      return "vendazap";
    case "dealroom":
      return "dealroom";
    case "onboarding":
      return "onboarding";
    case "commercial":
      return "commercial";
    case "system":
      return "vendazap";
    default:
      return "vendazap";
  }
}
