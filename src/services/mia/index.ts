/**
 * MIA Core — Unified AI Intelligence Module
 *
 * Phase 4: ActionExecutionEngine with permissions, confirmation, and audit.
 */

// Core
export { MIAOrchestrator, getMIAOrchestrator } from "./MIAOrchestrator";
export { buildContext } from "./ContextBuilder";
export { MIAMemoryEngine, getMIAMemoryEngine } from "./MIAMemoryEngine";
export type { MIAMemoryType, MIAMemoryEntry as MIAMemoryRecord } from "./MIAMemoryEngine";
export { MIAActionEngine, getMIAActionEngine } from "./MIAActionEngine";
export { MIAActionExecutionEngine, getMIAActionExecutionEngine } from "./ActionExecutionEngine";
export { MIALearningEngine, getMIALearningEngine } from "./MIALearningEngine";
export type { MIALearningEvent, MIALearningEventType, MIALearningScore, MIAPatternInsight } from "./MIALearningEngine";
export { ResearchEngine, getResearchEngine } from "./ResearchEngine";
export type { ResearchResult, ResearchSource } from "./ResearchEngine";
export type { MIAActionExecutionRequest, MIAActionExecutionResult, MIAActionStatus } from "./ActionExecutionEngine";
export { miaGenerateResponse } from "./MIAAdapter";
export { miaInvoke } from "./MIAInvoke";

// Engines
export { VendaZapEngine } from "./engines/VendaZapEngine";
export { DealRoomEngine } from "./engines/DealRoomEngine";
export { OnboardingEngine } from "./engines/OnboardingEngine";
export { CommercialEngine } from "./engines/CommercialEngine";
export { CashflowEngine } from "./engines/CashflowEngine";
export { ArgumentEngine } from "./engines/ArgumentEngine";

// Types
export type {
  MIAOrigin,
  MIAContextType,
  MIAActionType,
  MIAMessage,
  MIARequest,
  MIAResponseType,
  MIAResponse,
  MIAAction,
  MIAEngineInterface,
  MIAContext,
} from "./types";

// Adapter types
export type { MIAAdapterParams } from "./MIAAdapter";
