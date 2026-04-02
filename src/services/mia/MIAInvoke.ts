/**
 * MIA Invoke — Drop-in wrapper for supabase.functions.invoke
 * that routes through MIA Core for memory/audit while preserving
 * the exact same edge function call and response format.
 *
 * Usage: Replace `supabase.functions.invoke("vendazap-ai", { body })`
 * with `miaInvoke("vendazap-ai", body, { tenantId, userId, origin })`
 *
 * Returns the SAME { data, error } format as supabase.functions.invoke.
 */

import { supabase } from "@/lib/supabaseClient";
import { getMIAMemoryEngine } from "./MIAMemoryEngine";
import { getMIALearningEngine } from "./MIALearningEngine";
import type { MIAContextType, MIAOrigin } from "./types";

interface MIAInvokeOptions {
  tenantId: string;
  userId: string;
  origin: MIAOrigin;
  context?: MIAContextType;
  /** Skip memory recording for high-frequency calls */
  skipMemory?: boolean;
}

/** Map edge function names to MIA context types */
const FUNCTION_TO_CONTEXT: Record<string, MIAContextType> = {
  "vendazap-ai": "vendazap",
  "onboarding-ai": "onboarding",
  "commercial-ai": "commercial",
  "cashflow-ai": "cashflow",
  "improve-argument": "argument",
};

/**
 * Invoke an edge function through MIA Core.
 * Preserves exact { data, error } response format.
 * Adds memory recording as a non-blocking side effect.
 */
export async function miaInvoke(
  functionName: string,
  body: Record<string, unknown>,
  options: MIAInvokeOptions
): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> {
  // Call the edge function exactly as before
  const result = await supabase.functions.invoke(functionName, { body });

  // Non-blocking: record interaction in MIA memory + learning
  if (!options.skipMemory && options.tenantId && options.userId) {
    const context = options.context || FUNCTION_TO_CONTEXT[functionName] || "vendazap";
    const memory = getMIAMemoryEngine();
    const learning = getMIALearningEngine();

    void memory.remember(
      options.tenantId,
      options.userId,
      context,
      `${functionName}_${Date.now()}`,
      {
        function: functionName,
        origin: options.origin,
        hasResponse: Boolean(result.data),
        hasError: Boolean(result.error),
        timestamp: new Date().toISOString(),
      }
    );

    // Register learning event
    learning.registerEventAsync({
      tenant_id: options.tenantId,
      user_id: options.userId,
      event_type: "conversation",
      context: { function: functionName, origin: options.origin },
      action_taken: functionName,
      result: result.error ? "error" : "success",
      score: result.error ? -1 : result.data ? 1 : 0,
    });
  }

  return result;
}
