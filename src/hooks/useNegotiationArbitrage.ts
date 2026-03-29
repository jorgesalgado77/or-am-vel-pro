/**
 * useNegotiationArbitrage — Hook para o Motor de Arbitragem de Negociação
 */

import { useState, useCallback } from "react";
import {
  getArbitrageEngine,
  type ArbitrageContext,
  type ArbitrageResult,
  type ArbitrageScenario,
  type ArbitrageScenarioType,
} from "@/services/commercial/NegotiationArbitrageEngine";
import { toast } from "sonner";

interface UseNegotiationArbitrageReturn {
  result: ArbitrageResult | null;
  loading: boolean;
  selectedScenario: ArbitrageScenario | null;
  generateScenarios: (ctx: ArbitrageContext) => Promise<ArbitrageResult | null>;
  approveScenario: (scenarioId: string, approvedBy: string) => void;
  editScenario: (scenarioId: string, overrides: Partial<ArbitrageScenario>) => void;
  selectScenario: (scenarioId: string) => void;
  recordOutcome: (
    scenarioId: string,
    result: "ganho" | "perdido" | "abandonado",
    ctx: ArbitrageContext,
    tempoFechamentoDias?: number
  ) => Promise<void>;
}

export function useNegotiationArbitrage(): UseNegotiationArbitrageReturn {
  const [result, setResult] = useState<ArbitrageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<ArbitrageScenario | null>(null);

  const generateScenarios = useCallback(async (ctx: ArbitrageContext): Promise<ArbitrageResult | null> => {
    setLoading(true);
    try {
      const engine = getArbitrageEngine();
      const res = await engine.generateArbitrageScenarios(ctx);
      setResult(res);
      setSelectedScenario(null);
      return res;
    } catch (err) {
      toast.error("Erro ao gerar cenários de arbitragem");
      console.error("[ArbitrageEngine]", err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const approveScenario = useCallback((scenarioId: string, approvedBy: string) => {
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        scenarios: prev.scenarios.map((s) =>
          s.id === scenarioId ? { ...s, approved_by: approvedBy, requires_approval: false } : s
        ),
      };
    });
    toast.success("Cenário aprovado!");
  }, []);

  const editScenario = useCallback((scenarioId: string, overrides: Partial<ArbitrageScenario>) => {
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        scenarios: prev.scenarios.map((s) =>
          s.id === scenarioId ? { ...s, ...overrides, is_edited: true } : s
        ),
      };
    });
    toast.success("Cenário editado manualmente");
  }, []);

  const selectScenario = useCallback((scenarioId: string) => {
    setResult((prev) => {
      if (!prev) return prev;
      const found = prev.scenarios.find((s) => s.id === scenarioId);
      if (found) setSelectedScenario(found);
      return prev;
    });
  }, []);

  const recordOutcome = useCallback(
    async (
      scenarioId: string,
      outcomeResult: "ganho" | "perdido" | "abandonado",
      ctx: ArbitrageContext,
      tempoFechamentoDias?: number
    ) => {
      if (!result) return;
      const scenario = result.scenarios.find((s) => s.id === scenarioId);
      if (!scenario) return;

      try {
        const engine = getArbitrageEngine();
        await engine.recordOutcome({
          tenant_id: ctx.tenant_id,
          user_id: ctx.user_id,
          client_id: ctx.client_id,
          scenario_type: scenario.type,
          scenario_id: scenarioId,
          result: outcomeResult,
          valor_final: scenario.valor_final,
          gift_included: scenario.gifts.length > 0,
          gift_ids: scenario.gifts.map((g) => g.product_id),
          competitor_price: ctx.valor_concorrente,
          tempo_fechamento_dias: tempoFechamentoDias,
        });
        toast.success("Resultado registrado para aprendizado da IA");
      } catch (err) {
        toast.error("Erro ao registrar resultado");
        console.error("[ArbitrageOutcome]", err);
      }
    },
    [result]
  );

  return {
    result,
    loading,
    selectedScenario,
    generateScenarios,
    approveScenario,
    editScenario,
    selectScenario,
    recordOutcome,
  };
}
