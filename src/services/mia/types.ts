/**
 * MIA Core — Types
 * Unified type definitions for the MIA orchestration system.
 */

export type MIAContextType =
  | "vendazap"
  | "dealroom"
  | "onboarding"
  | "commercial"
  | "cashflow"
  | "campaign"
  | "argument";

export interface MIAMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface MIARequest {
  /** Which engine to route to */
  context: MIAContextType;
  /** Tenant isolation */
  tenantId: string;
  /** User isolation */
  userId?: string;
  /** Conversation messages */
  messages?: MIAMessage[];
  /** Simple text input (alternative to messages) */
  input?: string;
  /** Additional payload for the engine */
  payload?: Record<string, unknown>;
  /** Whether to use memory context injection */
  useMemory?: boolean;
}

export interface MIAResponse {
  /** The AI response text */
  content: string;
  /** Additional structured data from the engine */
  data?: Record<string, unknown>;
  /** Actions to execute */
  actions?: MIAAction[];
  /** Error if any */
  error?: string;
  /** Which engine handled the request */
  engine: MIAContextType;
  /** Provider used (openai, perplexity, lovable) */
  provider?: string;
}

export interface MIAAction {
  type: "navigate" | "create_task" | "save_config" | "send_message" | "open_modal" | "custom";
  target: string;
  payload?: Record<string, unknown>;
  label?: string;
}

export interface MIAMemoryEntry {
  tenantId: string;
  userId: string;
  context: MIAContextType;
  key: string;
  value: unknown;
  timestamp: number;
}

export interface MIAEngineInterface {
  /** Process a request and return a response */
  process(request: MIARequest): Promise<MIAResponse>;
  /** Engine identifier */
  readonly engineType: MIAContextType;
}
