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
): Promise<{ data: Record<string, unknown> | null; error: Error | null }> {
  // Call the edge function exactly as before
  const result = await supabase.functions.invoke(functionName, { body });

  // Non-blocking: record interaction in MIA memory
  if (!options.skipMemory && options.tenantId && options.userId) {
    const context = options.context || FUNCTION_TO_CONTEXT[functionName] || "vendazap";
    const memory = getMIAMemoryEngine();

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
  }

  return result;
}
