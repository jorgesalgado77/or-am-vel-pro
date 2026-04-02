/**
 * MIA Core — Unified AI Intelligence Module
 *
 * Phase 2: Real engine integration with edge functions.
 * Includes adapter for progressive integration with fallback.
 */

// Core
export { MIAOrchestrator, getMIAOrchestrator } from "./MIAOrchestrator";
export { buildContext } from "./ContextBuilder";
export { MIAMemoryEngine, getMIAMemoryEngine } from "./MIAMemoryEngine";
export type { MIAMemoryType, MIAMemoryEntry as MIAMemoryRecord } from "./MIAMemoryEngine";
export { MIAActionEngine, getMIAActionEngine } from "./MIAActionEngine";
export { miaGenerateResponse } from "./MIAAdapter";

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
