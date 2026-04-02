/**
 * MIA Core — Unified AI Intelligence Module
 *
 * Central export for all MIA services:
 * - MIAOrchestrator: Routes AI requests to the correct engine
 * - MIAMemoryEngine: Persistent memory per tenant+user
 * - MIAActionEngine: Execute real actions from AI responses
 * - Individual engines for each AI domain
 */

// Core
export { MIAOrchestrator, getMIAOrchestrator } from "./MIAOrchestrator";
export { MIAMemoryEngine, getMIAMemoryEngine } from "./MIAMemoryEngine";
export { MIAActionEngine, getMIAActionEngine } from "./MIAActionEngine";

// Engines
export { VendaZapEngine } from "./engines/VendaZapEngine";
export { DealRoomEngine } from "./engines/DealRoomEngine";
export { OnboardingEngine } from "./engines/OnboardingEngine";
export { CommercialEngine } from "./engines/CommercialEngine";
export { CashflowEngine } from "./engines/CashflowEngine";
export { ArgumentEngine } from "./engines/ArgumentEngine";

// Types
export type {
  MIAContextType,
  MIAMessage,
  MIARequest,
  MIAResponse,
  MIAAction,
  MIAMemoryEntry,
  MIAEngineInterface,
} from "./types";
