/**
 * LearningEngine — Analyzes historical patterns from ai_learning_events.
 *
 * Computes: conversion rates by strategy, vendor performance,
 * discount sweet spots, temperature conversion, DISC effectiveness.
 * Results are cached in ai_learned_patterns for fast retrieval.
 *
 * Multi-tenant isolated. No client-side secrets. Pure analytics.
 */

import { supabase } from "@/lib/supabaseClient";
import type {
  LearningEvent,
  StrategyConversion,
  VendorPerformance,
  DiscountSweetSpot,
  StrategyType,
  PatternType,
  LearnedPattern,
} from "./types";

// ==================== CACHE ====================

interface PatternCache {
  data: Record<string, unknown>;
  ts: number;
}

const patternCache = new Map<string, PatternCache>();
const PATTERN_CACHE_TTL = 10 * 60 * 1000; // 10 min

function cacheKey(tenantId: string, type: PatternType, key: string): string {
  return `${tenantId}:${type}:${key}`;
}

// ==================== RAW EVENT TYPES ====================

interface RawLearningEvent {
  id: string;
  tenant_id: string;
  user_id: string | null;
  client_id: string | null;
  event_type: string;
  strategy_used: string | null;
  price_offered: number | null;
  cost: number | null;
  discount_percentage: number | null;
  response_time_seconds: number | null;
  client_response: string | null;
  deal_result: string | null;
  disc_profile: string | null;
  lead_temperature: string | null;
  closing_probability: number | null;
  created_at: string;
}

// ==================== ENGINE ====================

export class LearningEngine {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  /**
   * Full pattern analysis — computes all pattern types.
   */
  async analyzePatterns(): Promise<{
    strategies: StrategyConversion[];
    discountSpot: DiscountSweetSpot;
    vendorPerformances: VendorPerformance[];
  }> {
    const events = await this.fetchRecentEvents(90);

    const strategies = this.computeStrategyConversions(events);
    const discountSpot = this.computeDiscountSweetSpot(events);
    const vendorPerformances = this.computeVendorPerformances(events);

    // Persist patterns in parallel
    await Promise.allSettled([
      ...strategies.map((s) =>
        this.upsertPattern("strategy_conversion", s.strategy, {
          ...s,
        }, s.total_events, s.conversion_rate * 100)
      ),
      this.upsertPattern("discount_sweet_spot", "global", discountSpot, discountSpot.sample_size, discountSpot.sample_size >= 10 ? 70 : 30),
      ...vendorPerformances.map((v) =>
        this.upsertPattern("vendor_performance", v.user_id, {
          ...v,
        }, v.total_deals, v.total_deals >= 5 ? 80 : 40)
      ),
    ]);

    return { strategies, discountSpot, vendorPerformances };
  }

  /**
   * Get conversion rate for a specific strategy.
   */
  async getStrategyConversion(strategy: StrategyType): Promise<StrategyConversion | null> {
    const ck = cacheKey(this.tenantId, "strategy_conversion", strategy);
    const cached = patternCache.get(ck);
    if (cached && Date.now() - cached.ts < PATTERN_CACHE_TTL) {
      return cached.data as unknown as StrategyConversion;
    }

    const events = await this.fetchRecentEvents(90, strategy);
    const conversions = this.computeStrategyConversions(events);
    const result = conversions.find((c) => c.strategy === strategy) || null;

    if (result) {
      patternCache.set(ck, { data: result as unknown as Record<string, unknown>, ts: Date.now() });
    }

    return result;
  }

  /**
   * Get best performing strategy for a given lead temperature.
   */
  async getBestStrategyForTemperature(temperature: string): Promise<StrategyType | null> {
    const ck = cacheKey(this.tenantId, "temperature_conversion", temperature);
    const cached = patternCache.get(ck);
    if (cached && Date.now() - cached.ts < PATTERN_CACHE_TTL) {
      return (cached.data as { best_strategy: StrategyType }).best_strategy;
    }

    const events = await this.fetchRecentEvents(90);
    const filtered = events.filter((e) => e.lead_temperature === temperature);

    if (filtered.length < 3) return null;

    const strategyGroups = this.groupBy(filtered, "strategy_used");
    let bestStrategy: StrategyType | null = null;
    let bestRate = 0;

    for (const [strategy, group] of Object.entries(strategyGroups)) {
      if (!strategy || strategy === "null") continue;
      const wins = group.filter((e) => e.client_response === "positivo" || e.deal_result === "ganho").length;
      const rate = group.length > 0 ? wins / group.length : 0;
      if (rate > bestRate) {
        bestRate = rate;
        bestStrategy = strategy as StrategyType;
      }
    }

    if (bestStrategy) {
      patternCache.set(ck, { data: { best_strategy: bestStrategy, rate: bestRate }, ts: Date.now() });
    }

    return bestStrategy;
  }

  /**
   * Get best strategy for a DISC profile.
   */
  async getBestStrategyForDisc(discProfile: string): Promise<StrategyType | null> {
    const ck = cacheKey(this.tenantId, "disc_strategy", discProfile);
    const cached = patternCache.get(ck);
    if (cached && Date.now() - cached.ts < PATTERN_CACHE_TTL) {
      return (cached.data as { best_strategy: StrategyType }).best_strategy;
    }

    const events = await this.fetchRecentEvents(90);
    const filtered = events.filter((e) => e.disc_profile === discProfile);

    if (filtered.length < 3) return null;

    const strategyGroups = this.groupBy(filtered, "strategy_used");
    let bestStrategy: StrategyType | null = null;
    let bestRate = 0;

    for (const [strategy, group] of Object.entries(strategyGroups)) {
      if (!strategy || strategy === "null") continue;
      const wins = group.filter((e) => e.client_response === "positivo" || e.deal_result === "ganho").length;
      const rate = group.length > 0 ? wins / group.length : 0;
      if (rate > bestRate) {
        bestRate = rate;
        bestStrategy = strategy as StrategyType;
      }
    }

    if (bestStrategy) {
      patternCache.set(ck, { data: { best_strategy: bestStrategy, rate: bestRate }, ts: Date.now() });
    }

    return bestStrategy;
  }

  /**
   * Get vendor performance stats.
   */
  async getVendorPerformance(userId: string): Promise<VendorPerformance | null> {
    const ck = cacheKey(this.tenantId, "vendor_performance", userId);
    const cached = patternCache.get(ck);
    if (cached && Date.now() - cached.ts < PATTERN_CACHE_TTL) {
      return cached.data as unknown as VendorPerformance;
    }

    const events = await this.fetchRecentEvents(90);
    const userEvents = events.filter((e) => e.user_id === userId);
    if (userEvents.length === 0) return null;

    const perfs = this.computeVendorPerformances(userEvents);
    const result = perfs[0] || null;

    if (result) {
      patternCache.set(ck, { data: result as unknown as Record<string, unknown>, ts: Date.now() });
    }

    return result;
  }

  // ==================== COMPUTATION ====================

  private computeStrategyConversions(events: RawLearningEvent[]): StrategyConversion[] {
    const groups = this.groupBy(events, "strategy_used");
    const results: StrategyConversion[] = [];

    for (const [strategy, group] of Object.entries(groups)) {
      if (!strategy || strategy === "null") continue;

      const positiveResponses = group.filter((e) => e.client_response === "positivo").length;
      const dealsWon = group.filter((e) => e.deal_result === "ganho").length;
      const discounts = group
        .filter((e) => e.discount_percentage !== null)
        .map((e) => e.discount_percentage as number);
      const responseTimes = group
        .filter((e) => e.response_time_seconds !== null)
        .map((e) => e.response_time_seconds as number);

      results.push({
        strategy: strategy as StrategyType,
        total_events: group.length,
        positive_responses: positiveResponses,
        deals_won: dealsWon,
        conversion_rate: group.length > 0 ? dealsWon / group.length : 0,
        avg_discount: discounts.length > 0 ? discounts.reduce((a, b) => a + b, 0) / discounts.length : 0,
        avg_response_time: responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
      });
    }

    return results.sort((a, b) => b.conversion_rate - a.conversion_rate);
  }

  private computeDiscountSweetSpot(events: RawLearningEvent[]): DiscountSweetSpot {
    const wonDeals = events.filter(
      (e) => e.deal_result === "ganho" && e.discount_percentage !== null && e.discount_percentage > 0
    );

    if (wonDeals.length === 0) {
      return { min_effective: 0, max_effective: 15, optimal: 8, sample_size: 0 };
    }

    const discounts = wonDeals.map((e) => e.discount_percentage as number).sort((a, b) => a - b);
    const q1Idx = Math.floor(discounts.length * 0.25);
    const q3Idx = Math.floor(discounts.length * 0.75);
    const median = discounts[Math.floor(discounts.length / 2)];

    return {
      min_effective: discounts[q1Idx],
      max_effective: discounts[q3Idx],
      optimal: median,
      sample_size: wonDeals.length,
    };
  }

  private computeVendorPerformances(events: RawLearningEvent[]): VendorPerformance[] {
    const userGroups = this.groupBy(
      events.filter((e) => e.user_id),
      "user_id"
    );
    const results: VendorPerformance[] = [];

    for (const [userId, group] of Object.entries(userGroups)) {
      if (!userId || userId === "null") continue;

      const dealEvents = group.filter(
        (e) => e.deal_result === "ganho" || e.deal_result === "perdido" || e.deal_result === "abandonado"
      );
      const wonDeals = dealEvents.filter((e) => e.deal_result === "ganho");
      const prices = wonDeals
        .filter((e) => e.price_offered !== null)
        .map((e) => e.price_offered as number);
      const discounts = group
        .filter((e) => e.discount_percentage !== null)
        .map((e) => e.discount_percentage as number);

      // Best strategy
      const stratGroups = this.groupBy(wonDeals, "strategy_used");
      let bestStrategy: StrategyType | null = null;
      let maxWins = 0;
      for (const [strat, sGroup] of Object.entries(stratGroups)) {
        if (strat && strat !== "null" && sGroup.length > maxWins) {
          maxWins = sGroup.length;
          bestStrategy = strat as StrategyType;
        }
      }

      // Top DISC
      const discGroups = this.groupBy(wonDeals, "disc_profile");
      let topDisc: string | null = null;
      let maxDiscWins = 0;
      for (const [disc, dGroup] of Object.entries(discGroups)) {
        if (disc && disc !== "null" && dGroup.length > maxDiscWins) {
          maxDiscWins = dGroup.length;
          topDisc = disc;
        }
      }

      results.push({
        user_id: userId,
        total_deals: dealEvents.length,
        won_deals: wonDeals.length,
        conversion_rate: dealEvents.length > 0 ? wonDeals.length / dealEvents.length : 0,
        avg_ticket: prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
        avg_discount: discounts.length > 0 ? discounts.reduce((a, b) => a + b, 0) / discounts.length : 0,
        avg_close_time_days: 0, // would require created_at analysis per client
        best_strategy: bestStrategy,
        top_disc_profile: topDisc,
      });
    }

    return results.sort((a, b) => b.conversion_rate - a.conversion_rate);
  }

  // ==================== DATA ACCESS ====================

  private async fetchRecentEvents(days: number, strategy?: string): Promise<RawLearningEvent[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    let query = supabase
      .from("ai_learning_events" as unknown as "clients")
      .select("*")
      .eq("tenant_id", this.tenantId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(1000);

    if (strategy) {
      query = query.eq("strategy_used", strategy);
    }

    const { data } = await query;
    return (data || []) as unknown as RawLearningEvent[];
  }

  private async upsertPattern(
    patternType: PatternType,
    patternKey: string,
    patternData: Record<string, unknown>,
    sampleSize: number,
    confidence: number,
  ): Promise<void> {
    try {
      await supabase
        .from("ai_learned_patterns" as unknown as "clients")
        .upsert(
          [{
            tenant_id: this.tenantId,
            pattern_type: patternType,
            pattern_key: patternKey,
            pattern_data: patternData,
            sample_size: sampleSize,
            confidence: Math.min(100, Math.max(0, confidence)),
            updated_at: new Date().toISOString(),
          }],
          { onConflict: "tenant_id,user_id,pattern_type,pattern_key" }
        );
    } catch (err) {
      console.error("[LearningEngine] upsert pattern error:", err);
    }
  }

  // ==================== UTILS ====================

  private groupBy<T extends Record<string, unknown>>(arr: T[], key: string): Record<string, T[]> {
    const result: Record<string, T[]> = {};
    for (const item of arr) {
      const k = String(item[key] ?? "null");
      if (!result[k]) result[k] = [];
      result[k].push(item);
    }
    return result;
  }
}

// ==================== FACTORY ====================

const engineCache = new Map<string, LearningEngine>();

export function getLearningEngine(tenantId: string): LearningEngine {
  let engine = engineCache.get(tenantId);
  if (!engine) {
    engine = new LearningEngine(tenantId);
    engineCache.set(tenantId, engine);
  }
  return engine;
}
