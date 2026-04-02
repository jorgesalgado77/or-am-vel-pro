/**
 * MIA Core — Unified AI Intelligence Module
 *
 * Phase 1: Base architecture only. No external AI calls.
 * Fully isolated — does NOT impact any existing system functionality.
 */

// Core
export { MIAOrchestrator, getMIAOrchestrator } from "./MIAOrchestrator";
export { buildContext } from "./ContextBuilder";
export { MIAMemoryEngine, getMIAMemoryEngine } from "./MIAMemoryEngine";
export { MIAActionEngine, getMIAActionEngine } from "./MIAActionEngine";

// Engines (Phase 1: placeholders)
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
  MIAMessage,
  MIARequest,
  MIAResponseType,
  MIAResponse,
  MIAAction,
  MIAMemoryEntry,
  MIAEngineInterface,
  MIAContext,
} from "./types";
