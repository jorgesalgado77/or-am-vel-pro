/**
 * MIA Personalization Engine — Adapts MIA responses based on:
 * - Vendor's DISC profile (tone, communication style)
 * - Client's DISC profile (persuasion strategy)
 * - Learning Engine insights (accumulated performance data)
 * - User preferences from memory
 *
 * Generates a personalization context string that is injected
 * into the system prompt before AI calls.
 *
 * Multi-tenant + user isolated. No `any`. Non-blocking.
 */

import { supabase } from "@/lib/supabaseClient";
import { getMIALearningEngine } from "./MIALearningEngine";
import { getMIAMemoryEngine } from "./MIAMemoryEngine";
import type { MIAContextType } from "./types";

// ── Types ───────────────────────────────────────────────────────

export type DISCProfile = "D" | "I" | "S" | "C" | "DI" | "DC" | "IS" | "SC" | "ID" | "SI" | "CS" | "CD";

export interface PersonalizationConfig {
  /** Tone of voice for MIA responses */
  tone: "direto" | "entusiastico" | "acolhedor" | "analitico" | "equilibrado";
  /** Level of detail */
  detailLevel: "resumido" | "moderado" | "detalhado";
  /** Communication style */
  style: string;
  /** Preferred strategies */
  preferredStrategies: string[];
  /** Strategies to avoid */
  avoidStrategies: string[];
  /** Extra instructions */
  instructions: string;
}

interface DISCToneMap {
  tone: PersonalizationConfig["tone"];
  detailLevel: PersonalizationConfig["detailLevel"];
  style: string;
  strategies: string[];
  avoid: string[];
}

// ── DISC Mappings ───────────────────────────────────────────────

/** How MIA should adapt when TALKING TO this DISC profile (client-facing) */
const CLIENT_DISC_MAP: Record<string, DISCToneMap> = {
  D: {
    tone: "direto",
    detailLevel: "resumido",
    style: "Seja objetivo, vá direto ao ponto. Foque em resultados e benefícios concretos. Evite rodeios.",
    strategies: ["urgencia", "escassez", "autoridade"],
    avoid: ["empatia"],
  },
  I: {
    tone: "entusiastico",
    detailLevel: "moderado",
    style: "Seja animado e sociável. Use histórias de sucesso, depoimentos. Valorize a experiência e o relacionamento.",
    strategies: ["prova_social", "reciprocidade", "valor"],
    avoid: ["escassez"],
  },
  S: {
    tone: "acolhedor",
    detailLevel: "detalhado",
    style: "Seja paciente e acolhedor. Dê segurança, explique passo a passo. Não pressione. Valorize estabilidade.",
    strategies: ["empatia", "consultiva", "valor"],
    avoid: ["urgencia", "escassez"],
  },
  C: {
    tone: "analitico",
    detailLevel: "detalhado",
    style: "Seja preciso e técnico. Apresente dados, comparativos, especificações. Evite exageros ou promessas vagas.",
    strategies: ["autoridade", "consultiva", "valor"],
    avoid: ["prova_social"],
  },
};

/** How MIA should adapt its INTERNAL tone for this vendor DISC (vendor-facing) */
const VENDOR_DISC_MAP: Record<string, { internalTone: string; coachingStyle: string }> = {
  D: {
    internalTone: "Seja direto e eficiente nas sugestões. Dê recomendações claras sem rodeios.",
    coachingStyle: "Foque em métricas e resultados. Sugira ações imediatas.",
  },
  I: {
    internalTone: "Seja motivador e positivo. Celebre conquistas. Use linguagem inspiradora.",
    coachingStyle: "Sugira abordagens criativas. Incentive networking e conexão com o cliente.",
  },
  S: {
    internalTone: "Seja calmo e organizado. Apresente mudanças de forma gradual. Dê suporte contínuo.",
    coachingStyle: "Sugira melhorias incrementais. Ofereça scripts prontos e templates.",
  },
  C: {
    internalTone: "Seja analítico e fundamentado. Apresente dados antes de recomendações. Seja preciso.",
    coachingStyle: "Forneça análises detalhadas com números. Compare métricas históricas.",
  },
};

// ── Cache ───────────────────────────────────────────────────────

interface CachedProfile {
  vendorDisc: string | null;
  timestamp: number;
}

const PROFILE_CACHE_TTL = 10 * 60 * 1000; // 10 min

// ── Engine ──────────────────────────────────────────────────────

class PersonalizationEngine {
  private profileCache = new Map<string, CachedProfile>();

  /**
   * Build a personalization context string for prompt injection.
   * Combines vendor DISC, client DISC (if provided), and learning insights.
   */
  async buildPersonalizationContext(params: {
    tenantId: string;
    userId: string;
    context: MIAContextType;
    clientDiscProfile?: string | null;
    clientTemperature?: string | null;
  }): Promise<string> {
    const { tenantId, userId, context, clientDiscProfile, clientTemperature } = params;

    const parts: string[] = [];

    // 1. Get vendor's DISC profile
    const vendorDisc = await this.getVendorDiscProfile(tenantId, userId);

    // 2. Build vendor-facing personalization (how MIA talks TO the vendor)
    if (vendorDisc) {
      const primary = vendorDisc.charAt(0).toUpperCase();
      const vendorMap = VENDOR_DISC_MAP[primary];
      if (vendorMap) {
        parts.push("\n=== PERSONALIZAÇÃO DO VENDEDOR ===");
        parts.push(`Perfil DISC do vendedor: ${vendorDisc}`);
        parts.push(`Tom interno: ${vendorMap.internalTone}`);
        parts.push(`Estilo de coaching: ${vendorMap.coachingStyle}`);
      }
    }

    // 3. Build client-facing personalization (how to approach the client)
    if (clientDiscProfile) {
      const primary = clientDiscProfile.charAt(0).toUpperCase();
      const clientMap = CLIENT_DISC_MAP[primary];
      if (clientMap) {
        parts.push("\n=== PERSONALIZAÇÃO PARA O CLIENTE ===");
        parts.push(`Perfil DISC do cliente: ${clientDiscProfile}`);
        parts.push(`Tom recomendado: ${clientMap.tone}`);
        parts.push(`Nível de detalhe: ${clientMap.detailLevel}`);
        parts.push(`Estilo: ${clientMap.style}`);
        parts.push(`Estratégias preferidas: ${clientMap.strategies.join(", ")}`);
        if (clientMap.avoid.length > 0) {
          parts.push(`Evitar: ${clientMap.avoid.join(", ")}`);
        }
      }
    }

    // 4. Temperature-based adjustments
    if (clientTemperature) {
      parts.push(`\nTemperatura do lead: ${clientTemperature}`);
      switch (clientTemperature.toLowerCase()) {
        case "quente":
          parts.push("→ Lead quente: seja ágil, objetivo, foque no fechamento. Cada hora conta.");
          break;
        case "morno":
          parts.push("→ Lead morno: mantenha engajamento, apresente valor, sem pressão excessiva.");
          break;
        case "frio":
          parts.push("→ Lead frio: reative com conteúdo de valor. Foque em relacionamento antes de venda.");
          break;
      }
    }

    // 5. Get learning-based preferences from memory
    try {
      const memory = getMIAMemoryEngine();
      const preferences = await memory.getMemory({
        tenant_id: tenantId,
        user_id: userId,
        memory_type: "user_preference",
        limit: 5,
      });

      if (preferences.length > 0) {
        parts.push("\n=== PREFERÊNCIAS DO USUÁRIO ===");
        for (const pref of preferences) {
          const val = typeof pref.value === "object" ? JSON.stringify(pref.value) : String(pref.value);
          parts.push(`• ${pref.key}: ${val}`);
        }
      }
    } catch {
      // Non-critical
    }

    // 6. Get top strategies from learning engine
    try {
      const learning = getMIALearningEngine();
      const insights = await learning.getInsights(tenantId, userId);
      const topStrategies = insights
        .filter((i) => i.type === "top_strategy" && i.confidence >= 50)
        .slice(0, 3);

      if (topStrategies.length > 0) {
        parts.push("\n=== ESTRATÉGIAS COM MELHOR PERFORMANCE ===");
        for (const strategy of topStrategies) {
          parts.push(`• ${strategy.description}`);
        }
      }

      const avoidStrategies = insights
        .filter((i) => i.type === "avoid_strategy" && i.confidence >= 40)
        .slice(0, 2);

      if (avoidStrategies.length > 0) {
        parts.push("\n=== ESTRATÉGIAS A EVITAR ===");
        for (const strategy of avoidStrategies) {
          parts.push(`• ${strategy.description}`);
        }
      }
    } catch {
      // Non-critical
    }

    return parts.length > 0 ? parts.join("\n") : "";
  }

  /**
   * Get a quick PersonalizationConfig for a client DISC profile.
   */
  getClientConfig(discProfile: string | null): PersonalizationConfig {
    if (!discProfile) {
      return {
        tone: "equilibrado",
        detailLevel: "moderado",
        style: "Abordagem equilibrada e profissional.",
        preferredStrategies: ["consultiva", "valor"],
        avoidStrategies: [],
        instructions: "",
      };
    }

    const primary = discProfile.charAt(0).toUpperCase();
    const map = CLIENT_DISC_MAP[primary];

    if (!map) {
      return {
        tone: "equilibrado",
        detailLevel: "moderado",
        style: "Abordagem equilibrada e profissional.",
        preferredStrategies: ["consultiva", "valor"],
        avoidStrategies: [],
        instructions: "",
      };
    }

    return {
      tone: map.tone,
      detailLevel: map.detailLevel,
      style: map.style,
      preferredStrategies: map.strategies,
      avoidStrategies: map.avoid,
      instructions: `Adapte para perfil ${discProfile}: ${map.style}`,
    };
  }

  // ── Private ───────────────────────────────────────────────────

  private async getVendorDiscProfile(tenantId: string, userId: string): Promise<string | null> {
    const cacheKey = `${tenantId}:${userId}`;
    const cached = this.profileCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PROFILE_CACHE_TTL) {
      return cached.vendorDisc;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- usuarios not in generated types
      const { data } = await (supabase as any)
        .from("usuarios")
        .select("disc_profile")
        .eq("tenant_id", tenantId)
        .eq("auth_user_id", userId)
        .maybeSingle();

      const disc = data?.disc_profile || null;
      this.profileCache.set(cacheKey, { vendorDisc: disc, timestamp: Date.now() });
      return disc;
    } catch {
      this.profileCache.set(cacheKey, { vendorDisc: null, timestamp: Date.now() });
      return null;
    }
  }
}

// ── Singleton ───────────────────────────────────────────────────

let instance: PersonalizationEngine | null = null;

export function getPersonalizationEngine(): PersonalizationEngine {
  if (!instance) {
    instance = new PersonalizationEngine();
  }
  return instance;
}

export { PersonalizationEngine };
