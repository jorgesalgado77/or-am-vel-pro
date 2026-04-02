/**
 * MIA Orchestrator — Central intelligence router (Phase 2)
 *
 * Routes requests through ContextBuilder for validation,
 * delegates to registered engines, manages memory and actions.
 * 
 * Phase 2: Real engine integration with edge functions.
 * Engines are auto-registered on construction.
 */

import type {
  MIARequest,
  MIAResponse,
  MIAContextType,
  MIAEngineInterface,
} from "./types";
import { buildContext } from "./ContextBuilder";
import { getMIAMemoryEngine, type MIAMemoryEngine } from "./MIAMemoryEngine";
import { getMIAActionEngine } from "./MIAActionEngine";
import { getMIAActionExecutionEngine, type MIAActionExecutionEngine } from "./ActionExecutionEngine";
import { getMIALearningEngine, type MIALearningEngine, type MIALearningScore } from "./MIALearningEngine";
import { getResearchEngine, type ResearchEngine } from "./ResearchEngine";
import { getPersonalizationEngine, type PersonalizationEngine } from "./PersonalizationEngine";
import { VendaZapEngine } from "./engines/VendaZapEngine";
import { DealRoomEngine } from "./engines/DealRoomEngine";
import { OnboardingEngine } from "./engines/OnboardingEngine";
import { CommercialEngine } from "./engines/CommercialEngine";
import { CashflowEngine } from "./engines/CashflowEngine";
import { ArgumentEngine } from "./engines/ArgumentEngine";

class MIAOrchestrator {
  private engines: Map<MIAContextType, MIAEngineInterface> = new Map();
  private memory: MIAMemoryEngine = getMIAMemoryEngine();
  private actions = getMIAActionEngine();
  private actionExecution: MIAActionExecutionEngine = getMIAActionExecutionEngine();
  private learning: MIALearningEngine = getMIALearningEngine();
  private research: ResearchEngine = getResearchEngine();
  private personalization: PersonalizationEngine = getPersonalizationEngine();

  constructor() {
    // Auto-register all engines
    this.engines.set("vendazap", new VendaZapEngine());
    this.engines.set("dealroom", new DealRoomEngine());
    this.engines.set("onboarding", new OnboardingEngine());
    this.engines.set("commercial", new CommercialEngine());
    this.engines.set("cashflow", new CashflowEngine());
    this.engines.set("argument", new ArgumentEngine());
    // Campaign reuses VendaZapEngine
    this.engines.set("campaign", new VendaZapEngine());
  }

  /**
   * Central request handler.
   * Validates input, builds context, routes to engine,
   * manages memory and actions.
   */
  async handleRequest(request: MIARequest): Promise<MIAResponse> {
    try {
      // Validate and build context (throws on missing tenant_id / user_id)
      const context = buildContext(request);

      // Route to engine
      const engine = this.engines.get(request.context);
      if (!engine) {
        return {
          type: "text",
          message: `Engine não encontrado para contexto: ${request.context}`,
          error: `Engine não registrado: ${request.context}`,
          engine: request.context,
        };
      }

      // Inject memory, learning insights, and personalization context
      let enrichedRequest = request;
      if (request.messages && request.messages.length > 0) {
        try {
          const promises: Promise<string>[] = [];

          if (request.useMemory) {
            promises.push(
              this.memory.buildContextString(context.tenant_id, context.user_id, request.context),
              this.learning.buildInsightsContext(context.tenant_id, context.user_id),
            );
          } else {
            promises.push(Promise.resolve(""), Promise.resolve(""));
          }

          // Always inject personalization
          promises.push(
            this.personalization.buildPersonalizationContext({
              tenantId: context.tenant_id,
              userId: context.user_id,
              context: request.context,
              clientDiscProfile: (request.metadata?.disc_profile as string) || null,
              clientTemperature: (request.metadata?.lead_temperature as string) || null,
            })
          );

          const [memoryCtx, insightsCtx, personalizationCtx] = await Promise.all(promises);

          const extraContext = (memoryCtx || "") + (insightsCtx || "") + (personalizationCtx || "");
          if (extraContext) {
            const systemIdx = request.messages.findIndex((m) => m.role === "system");
            if (systemIdx >= 0) {
              const updatedMessages = [...request.messages];
              updatedMessages[systemIdx] = {
                ...updatedMessages[systemIdx],
                content: updatedMessages[systemIdx].content + extraContext,
              };
              enrichedRequest = { ...request, messages: updatedMessages };
            }
          }
        } catch {
          // Context injection is non-critical
        }
      }

      // Process through engine
      let response = await engine.process(enrichedRequest);

      // Enrich with research if needed (non-blocking on failure)
      if (request.message && this.research.shouldSearch(request.message)) {
        try {
          const researchResult = await this.research.search({
            query: request.message,
            tenantId: context.tenant_id,
            userId: context.user_id,
            context: `Contexto: ${request.context}`,
          });

          if (researchResult.summary && researchResult.sources.length > 0) {
            const sourcesText = researchResult.sources
              .map((s) => `• [${s.title}](${s.url})`)
              .join("\n");

            response = {
              ...response,
              message: `${response.message}\n\n📊 **Pesquisa de Mercado:**\n${researchResult.summary}\n\n🔗 **Fontes:**\n${sourcesText}`,
              data: {
                ...response.data,
                research: {
                  summary: researchResult.summary,
                  sources: researchResult.sources,
                  cached: researchResult.cached,
                },
              },
            };
          }
        } catch {
          // Research failure is non-critical
        }
      }

      // Store relevant interaction in memory (non-critical)
      if (request.message && request.message.length > 5) {
        try {
          await this.memory.remember(
            context.tenant_id,
            context.user_id,
            request.context,
            `interaction_${Date.now()}`,
            {
              input: request.message.substring(0, 200),
              origin: context.origin,
              timestamp: context.timestamp,
              hasResponse: Boolean(response.message),
            }
          );
        } catch {
          // Non-critical — memory save failure doesn't affect response
        }
      }

      // Execute actions via ActionExecutionEngine (with audit + permissions)
      if (response.actions && response.actions.length > 0) {
        try {
          await this.actionExecution.executeActions(
            response.actions,
            context.tenant_id,
            context.user_id
          );
        } catch (e) {
          console.warn("[MIAOrchestrator] Action execution failed:", e);
        }
      }

      // Register learning event (non-blocking)
      const score: MIALearningScore = response.error ? -1 : response.message ? 1 : 0;
      this.learning.registerEventAsync({
        tenant_id: context.tenant_id,
        user_id: context.user_id,
        event_type: "conversation",
        context: {
          engine: request.context,
          origin: context.origin,
          hasActions: Boolean(response.actions?.length),
          messageLength: request.message?.length || 0,
        },
        action_taken: request.context,
        result: response.error ? "error" : "success",
        score,
      });

      return response;
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

  /**
   * Alias for handleRequest — standard method name for AI generation.
   */
  async generateResponse(request: MIARequest): Promise<MIAResponse> {
    return this.handleRequest(request);
  }

  /** Register a custom engine (replaces existing if same type) */
  registerEngine(engine: MIAEngineInterface): void {
    this.engines.set(engine.engineType, engine);
  }

  /** Get the memory engine for direct operations */
  getMemory() {
    return this.memory;
  }

  /** Get the legacy action engine */
  getActions() {
    return this.actions;
  }

  /** Get the action execution engine (with permissions + audit) */
  getActionExecution() {
    return this.actionExecution;
  }

  /** Get the learning engine */
  getLearning() {
    return this.learning;
  }

  /** Get the research engine */
  getResearch() {
    return this.research;
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
