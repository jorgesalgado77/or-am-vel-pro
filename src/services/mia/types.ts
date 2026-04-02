/**
 * MIA Core — Types (v2)
 * Unified type definitions for the MIA orchestration system.
 * 
 * RULES:
 * - tenant_id and user_id are ALWAYS required (multi-tenant + user isolation)
 * - No `any` usage
 * - Fully typed, no optional critical fields
 */

// ── Origin / Context ────────────────────────────────────────────

/** Where the request originated from */
export type MIAOrigin = "chat" | "dealroom" | "onboarding" | "commercial" | "system";

/** Which engine should handle the request */
export type MIAContextType =
  | "vendazap"
  | "dealroom"
  | "onboarding"
  | "commercial"
  | "cashflow"
  | "campaign"
  | "argument";

// ── Messages ────────────────────────────────────────────────────

export interface MIAMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// ── Request ─────────────────────────────────────────────────────

export interface MIARequest {
  /** Which engine to route to */
  context: MIAContextType;
  /** Tenant isolation — REQUIRED */
  tenantId: string;
  /** User isolation — REQUIRED */
  userId: string;
  /** Where the request originated */
  origin: MIAOrigin;
  /** Simple text input */
  message: string;
  /** Conversation messages (optional, for multi-turn) */
  messages?: MIAMessage[];
  /** Additional payload for the engine */
  metadata?: Record<string, unknown>;
  /** Whether to use memory context injection */
  useMemory?: boolean;
}

// ── Response ────────────────────────────────────────────────────

export type MIAResponseType = "text" | "action" | "navigation";

export interface MIAAction {
  type: "navigate" | "create_task" | "save_config" | "send_message" | "open_modal" | "custom";
  target: string;
  payload?: Record<string, unknown>;
  label?: string;
}

export interface MIAResponse {
  /** Response type classifier */
  type: MIAResponseType;
  /** The AI response text */
  message: string;
  /** Actions to execute */
  actions?: MIAAction[];
  /** Next step suggestion */
  next_step?: string;
  /** Additional structured data from the engine */
  data?: Record<string, unknown>;
  /** Error if any */
  error?: string;
  /** Which engine handled the request */
  engine: MIAContextType;
  /** Provider used (openai, perplexity, lovable) */
  provider?: string;
}

// Memory types are now in MIAMemoryEngine.ts

// ── Engine Interface ────────────────────────────────────────────

export interface MIAEngineInterface {
  /** Process a request and return a response */
  process(request: MIARequest): Promise<MIAResponse>;
  /** Engine identifier */
  readonly engineType: MIAContextType;
}

// ── Context (built by ContextBuilder) ───────────────────────────

export interface MIAContext {
  tenant_id: string;
  user_id: string;
  message: string;
  origin: MIAOrigin;
  timestamp: string;
  metadata?: Record<string, unknown>;
}
