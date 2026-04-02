/**
 * MIA ContextBuilder — Builds a structured context from a MIARequest.
 * 
 * PHASE 1: Pure data structuring only.
 * - NO database access
 * - NO CRM integration
 * - NO external API calls
 * - Only structures the base context for future engine consumption.
 */

import type { MIARequest, MIAContext } from "./types";

/**
 * Build a structured context object from a MIA request.
 * Validates required fields (tenant_id, user_id) and produces
 * a clean, timestamped context for engine consumption.
 */
export function buildContext(request: MIARequest): MIAContext {
  if (!request.tenantId) {
    throw new Error("[MIA ContextBuilder] tenant_id é obrigatório");
  }
  if (!request.userId) {
    throw new Error("[MIA ContextBuilder] user_id é obrigatório");
  }

  return {
    tenant_id: request.tenantId,
    user_id: request.userId,
    message: request.message || "",
    origin: request.origin,
    timestamp: new Date().toISOString(),
    metadata: request.metadata,
  };
}
