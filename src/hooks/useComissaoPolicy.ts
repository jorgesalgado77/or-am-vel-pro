import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useMemo } from "react";

export interface ComissaoFaixa {
  min: number;
  max: number;
  comissao: number;
  premio: number;
}

export interface ComissaoPolicy {
  tipo: "fixa" | "escalonada";
  faixas: ComissaoFaixa[];
  cargos_ids: string[]; // IDs dos cargos que usam escalonada
}

const DEFAULT_POLICY: ComissaoPolicy = {
  tipo: "fixa",
  faixas: [
    { min: 0, max: 99999.99, comissao: 4, premio: 0 },
    { min: 100000, max: 120000, comissao: 4, premio: 0.5 },
    { min: 120001, max: 150000, comissao: 4, premio: 1 },
    { min: 150001, max: 180000, comissao: 4, premio: 1.5 },
    { min: 180001, max: 210000, comissao: 4, premio: 2 },
    { min: 210001, max: 240000, comissao: 4, premio: 2.5 },
    { min: 240001, max: 270000, comissao: 4, premio: 3 },
    { min: 270001, max: 300000, comissao: 4, premio: 3.5 },
    { min: 300001, max: 330000, comissao: 4, premio: 4 },
    { min: 330001, max: 360000, comissao: 4, premio: 4.5 },
    { min: 360001, max: 390000, comissao: 4, premio: 5 },
    { min: 390001, max: 420000, comissao: 4, premio: 5.5 },
    { min: 420001, max: 450000, comissao: 4, premio: 6 },
  ],
  cargos_ids: [],
};

export function useComissaoPolicy() {
  const { settings, refresh } = useCompanySettings();

  const policy: ComissaoPolicy = useMemo(() => {
    const raw = (settings as any).comissao_policy;
    if (!raw || typeof raw !== "object") return DEFAULT_POLICY;
    return {
      tipo: raw.tipo || "fixa",
      faixas: Array.isArray(raw.faixas) ? raw.faixas : DEFAULT_POLICY.faixas,
      cargos_ids: Array.isArray(raw.cargos_ids) ? raw.cargos_ids : [],
    };
  }, [settings]);

  return { policy, refresh, settingsId: settings.id };
}

/**
 * Calcula a comissão com base na política e valor da venda.
 * Se tipo="escalonada" e o cargo está nos cargos_ids, usa faixas.
 * Senão, usa comissão fixa do cargo.
 */
export function calcularComissao(
  valorVenda: number,
  comissaoFixaCargo: number,
  policy: ComissaoPolicy,
  cargoId: string | null
): { comissaoBase: number; premio: number; total: number; percentual: number } {
  // Se tipo fixo ou cargo não está na lista de escalonada
  if (policy.tipo === "fixa" || !cargoId || !policy.cargos_ids.includes(cargoId)) {
    return {
      comissaoBase: comissaoFixaCargo,
      premio: 0,
      total: comissaoFixaCargo,
      percentual: comissaoFixaCargo,
    };
  }

  // Escalonada: encontrar a faixa
  const faixa = policy.faixas.find(f => valorVenda >= f.min && valorVenda <= f.max);
  
  if (!faixa) {
    // Se valor acima de todas as faixas, usar última faixa
    const ultima = policy.faixas[policy.faixas.length - 1];
    if (ultima && valorVenda > ultima.max) {
      return {
        comissaoBase: ultima.comissao,
        premio: ultima.premio,
        total: ultima.comissao + ultima.premio,
        percentual: ultima.comissao + ultima.premio,
      };
    }
    return { comissaoBase: comissaoFixaCargo, premio: 0, total: comissaoFixaCargo, percentual: comissaoFixaCargo };
  }

  return {
    comissaoBase: faixa.comissao,
    premio: faixa.premio,
    total: faixa.comissao + faixa.premio,
    percentual: faixa.comissao + faixa.premio,
  };
}
