/**
 * MIA Orchestrator — Central intelligence router
 * Routes requests to the correct engine, manages memory injection,
 * and handles action execution.
 */

import type {
  MIARequest,
  MIAResponse,
  MIAContextType,
  MIAEngineInterface,
} from "./types";
import { getMIAMemoryEngine } from "./MIAMemoryEngine";
import { getMIAActionEngine } from "./MIAActionEngine";
import { VendaZapEngine } from "./engines/VendaZapEngine";
import { DealRoomEngine } from "./engines/DealRoomEngine";
import { OnboardingEngine } from "./engines/OnboardingEngine";
import { CommercialEngine } from "./engines/CommercialEngine";
import { CashflowEngine } from "./engines/CashflowEngine";
import { ArgumentEngine } from "./engines/ArgumentEngine";

class MIAOrchestrator {
  private engines: Map<MIAContextType, MIAEngineInterface>;
  private memory = getMIAMemoryEngine();
  private actions = getMIAActionEngine();

  constructor() {
    this.engines = new Map();
    this.engines.set("vendazap", new VendaZapEngine());
    this.engines.set("dealroom", new DealRoomEngine());
    this.engines.set("onboarding", new OnboardingEngine());
    this.engines.set("commercial", new CommercialEngine());
    this.engines.set("cashflow", new CashflowEngine());
    this.engines.set("argument", new ArgumentEngine());
    // Campaign uses VendaZapEngine with different payload
    this.engines.set("campaign", new VendaZapEngine());
  }

  /**
   * Central request handler — routes to the correct engine
   * with memory injection and action execution.
   */
  async handleRequest(request: MIARequest): Promise<MIAResponse> {
    const engine = this.engines.get(request.context);
    if (!engine) {
      return {
        content: "",
        error: `Engine não encontrado para contexto: ${request.context}`,
        engine: request.context,
      };
    }

    if (!request.tenantId) {
      return {
        content: "",
        error: "tenant_id é obrigatório",
        engine: request.context,
      };
    }

    // Inject memory context if requested
    let enrichedRequest = { ...request };
    if (request.useMemory && request.userId) {
      try {
        const memoryContext = await this.memory.buildContextString(
          request.tenantId,
          request.userId,
          request.context
        );
        if (memoryContext && enrichedRequest.messages && enrichedRequest.messages.length > 0) {
          // Inject memory into the system message
          const systemIdx = enrichedRequest.messages.findIndex((m) => m.role === "system");
          if (systemIdx >= 0) {
            enrichedRequest.messages = [...enrichedRequest.messages];
            enrichedRequest.messages[systemIdx] = {
              ...enrichedRequest.messages[systemIdx],
              content: enrichedRequest.messages[systemIdx].content + memoryContext,
            };
          }
        }
      } catch (e) {
        console.warn("[MIAOrchestrator] Memory injection failed:", e);
      }
    }

    // Process through engine
    const response = await engine.process(enrichedRequest);

    // Store interaction in memory if userId is available
    if (request.userId && request.input) {
      try {
        await this.memory.remember(
          request.tenantId,
          request.userId,
          request.context,
          `last_interaction_${Date.now()}`,
          {
            input: request.input.substring(0, 200),
            timestamp: Date.now(),
          }
        );
      } catch {
        // Non-critical, ignore
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

  /** Get the memory engine for direct memory operations */
  getMemory() {
    return this.memory;
  }

  /** Get the action engine for registering handlers */
  getActions() {
    return this.actions;
  }

  /** Register a custom engine */
  registerEngine(engine: MIAEngineInterface): void {
    this.engines.set(engine.engineType, engine);
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
