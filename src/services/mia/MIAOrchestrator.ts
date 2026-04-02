/**
 * MIA Orchestrator — Central intelligence router (v2)
 *
 * PHASE 1: Placeholder-only responses. No AI calls, no external APIs.
 * Routes requests through ContextBuilder for validation and structuring.
 *
 * RULES:
 * - tenant_id and user_id are ALWAYS validated
 * - No `any` usage
 * - No external API calls in Phase 1
 * - Fully isolated — does not impact existing system
 */

import type {
  MIARequest,
  MIAResponse,
  MIAContextType,
  MIAEngineInterface,
} from "./types";
import { buildContext } from "./ContextBuilder";
import { getMIAMemoryEngine } from "./MIAMemoryEngine";
import { getMIAActionEngine } from "./MIAActionEngine";

class MIAOrchestrator {
  private engines: Map<MIAContextType, MIAEngineInterface> = new Map();
  private memory = getMIAMemoryEngine();
  private actions = getMIAActionEngine();

  /**
   * Central request handler.
   * Phase 1: validates input, builds context, returns placeholder.
   * Future phases will route to registered engines.
   */
  async handleRequest(request: MIARequest): Promise<MIAResponse> {
    try {
      // Validate and build context (throws on missing tenant_id / user_id)
      const context = buildContext(request);

      // Check if a specialized engine is registered for this context
      const engine = this.engines.get(request.context);
      if (engine) {
        const response = await engine.process(request);

        // Store interaction in memory if available
        if (request.message) {
          try {
            await this.memory.remember(
              context.tenant_id,
              context.user_id,
              request.context,
              `last_interaction_${Date.now()}`,
              {
                input: request.message.substring(0, 200),
                origin: context.origin,
                timestamp: context.timestamp,
              }
            );
          } catch {
            // Non-critical
          }
        }

        // Execute actions if any
        if (response.actions && response.actions.length > 0) {
          try {
            await this.actions.executeActions(response.actions);
          } catch (e) {
            console.warn("[MIAOrchestrator] Action execution failed:", e);
          }
        }

        return response;
      }

      // Phase 1 fallback: placeholder response (no AI calls)
      return {
        type: "text",
        message: `[MIA Core] Recebi sua mensagem de "${context.origin}": "${context.message}"`,
        actions: [],
        engine: request.context,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      console.error("[MIAOrchestrator] Error:", errorMessage);

      return {
        type: "text",
        message: "Ocorreu um erro ao processar sua solicitação.",
        error: errorMessage,
        engine: request.context,
      };
    }
  }

  /** Register a specialized engine for a context type */
  registerEngine(engine: MIAEngineInterface): void {
    this.engines.set(engine.engineType, engine);
  }

  /** Get the memory engine for direct memory operations */
  getMemory() {
    return this.memory;
  }

  /** Get the action engine for registering handlers */
  getActions() {
    return this.actions;
  }
}

// Singleton
let instance: MIAOrchestrator | null = null;

export function getMIAOrchestrator(): MIAOrchestrator {
  if (!instance) {
    instance = new MIAOrchestrator();
  }
  return instance;
}

export { MIAOrchestrator };
