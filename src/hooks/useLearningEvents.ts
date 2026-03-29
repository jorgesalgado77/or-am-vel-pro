/**
 * useLearningEvents — Auto-registers commercial events for AI learning.
 *
 * Provides a `recordEvent` function that fires-and-forgets learning events
 * into ai_learning_events. Used by VendaZap, triggers, simulator, and sales.
 *
 * Never blocks the UI — all writes are async with error swallowing.
 */

import { useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { LearningEvent, LearningEventType, StrategyType, ClientResponse, DealResult } from "@/services/ai/types";

interface UseLearningEventsParams {
  tenantId: string | null;
  userId?: string | null;
}

export function useLearningEvents({ tenantId, userId }: UseLearningEventsParams) {
  const pendingRef = useRef<boolean>(false);

  const recordEvent = useCallback(
    (event: Omit<LearningEvent, "tenant_id"> & { tenant_id?: string }) => {
      if (!tenantId) return;

      const row = {
        ...event,
        tenant_id: tenantId,
        user_id: event.user_id || userId || null,
      };

      // Fire and forget — never block the UI
      void (async () => {
        if (pendingRef.current) return; // debounce rapid fires
        pendingRef.current = true;
        try {
          const table = supabase.from("ai_learning_events" as unknown as "clients");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (table as unknown as { insert: (rows: unknown[]) => Promise<unknown> })
            .insert([row]);
        } catch (err) {
          console.error("[LearningEvents] record error:", err);
        } finally {
          pendingRef.current = false;
        }
      })();
    },
    [tenantId, userId]
  );

  const recordMessageSent = useCallback(
    (params: {
      clientId?: string;
      trackingId?: string;
      strategy?: StrategyType;
      messageContent?: string;
      discProfile?: string;
      temperature?: string;
      closingProbability?: number;
    }) => {
      recordEvent({
        event_type: "message_sent",
        client_id: params.clientId || null,
        tracking_id: params.trackingId || null,
        strategy_used: params.strategy || null,
        message_content: params.messageContent || null,
        disc_profile: params.discProfile || null,
        lead_temperature: params.temperature || null,
        closing_probability: params.closingProbability || null,
      });
    },
    [recordEvent]
  );

  const recordProposalSent = useCallback(
    (params: {
      clientId: string;
      priceOffered: number;
      discountPercentage?: number;
      strategy?: StrategyType;
    }) => {
      recordEvent({
        event_type: "proposal_sent",
        client_id: params.clientId,
        price_offered: params.priceOffered,
        discount_percentage: params.discountPercentage || 0,
        strategy_used: params.strategy || null,
      });
    },
    [recordEvent]
  );

  const recordDealClosed = useCallback(
    (params: {
      clientId: string;
      priceOffered: number;
      cost?: number;
      discountPercentage?: number;
      strategy?: StrategyType;
      discProfile?: string;
    }) => {
      recordEvent({
        event_type: "deal_closed",
        client_id: params.clientId,
        price_offered: params.priceOffered,
        cost: params.cost || null,
        discount_percentage: params.discountPercentage || 0,
        deal_result: "ganho",
        strategy_used: params.strategy || null,
        disc_profile: params.discProfile || null,
      });
    },
    [recordEvent]
  );

  const recordDealLost = useCallback(
    (params: {
      clientId: string;
      priceOffered?: number;
      discountPercentage?: number;
      clientResponse?: ClientResponse;
    }) => {
      recordEvent({
        event_type: "deal_lost",
        client_id: params.clientId,
        price_offered: params.priceOffered || null,
        discount_percentage: params.discountPercentage || 0,
        deal_result: "perdido",
        client_response: params.clientResponse || "negativo",
      });
    },
    [recordEvent]
  );

  const recordTriggerFired = useCallback(
    (params: {
      clientId: string;
      trackingId?: string;
      strategy?: StrategyType;
      temperature?: string;
    }) => {
      recordEvent({
        event_type: "trigger_fired",
        client_id: params.clientId,
        tracking_id: params.trackingId || null,
        strategy_used: params.strategy || null,
        lead_temperature: params.temperature || null,
      });
    },
    [recordEvent]
  );

  const recordClientResponse = useCallback(
    (params: {
      clientId?: string;
      trackingId?: string;
      response: ClientResponse;
      responseTimeSeconds?: number;
    }) => {
      recordEvent({
        event_type: "message_sent",
        client_id: params.clientId || null,
        tracking_id: params.trackingId || null,
        client_response: params.response,
        response_time_seconds: params.responseTimeSeconds || null,
      });
    },
    [recordEvent]
  );

  return {
    recordEvent,
    recordMessageSent,
    recordProposalSent,
    recordDealClosed,
    recordDealLost,
    recordTriggerFired,
    recordClientResponse,
  };
}
