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

/** Cargos que ganham comissão sobre o total de vendas da loja (não por cliente) */
const CARGOS_TOTAL_LOJA = ["gerente"];

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
 * Verifica se um cargo ganha comissão sobre o total de vendas da loja.
 * Cargos como "gerente" ganham sobre toda a venda à vista da loja.
 * Cargos como "vendedor", "projetista", "liberador", "técnico", "medidor", "montador"
 * ganham comissão apenas por clientes relacionados.
 */
export function isCargoTotalLoja(cargoNome: string | null | undefined): boolean {
  if (!cargoNome) return false;
  return CARGOS_TOTAL_LOJA.includes(cargoNome.toLowerCase().trim());
}

/**
 * Calcula a comissão com base na política e valor da venda.
 * Se tipo="escalonada" e o cargo está nos cargos_ids, usa faixas.
 * Senão, usa comissão fixa do cargo.
 * 
 * @param valorVenda - Valor da venda à vista
 * @param comissaoFixaCargo - Percentual fixo configurado no cargo
 * @param policy - Política de comissão da loja
 * @param cargoId - ID do cargo do usuário
 * @param cargoNome - Nome do cargo (para determinar se é gerente)
 * @param valorTotalLoja - Total de vendas da loja no período (usado para gerentes)
 */
export function calcularComissao(
  valorVenda: number,
  comissaoFixaCargo: number,
  policy: ComissaoPolicy,
  cargoId: string | null,
  cargoNome?: string | null,
  valorTotalLoja?: number
): { comissaoBase: number; premio: number; total: number; percentual: number; baseCalculo: number; tipoCalculo: "por_cliente" | "total_loja" } {
  // Determinar se é cargo que ganha sobre total da loja
  const totalLoja = isCargoTotalLoja(cargoNome);
  const valorBase = totalLoja && valorTotalLoja !== undefined ? valorTotalLoja : valorVenda;

  // Se tipo fixo ou cargo não está na lista de escalonada
  if (policy.tipo === "fixa" || !cargoId || !policy.cargos_ids.includes(cargoId)) {
    return {
      comissaoBase: comissaoFixaCargo,
      premio: 0,
      total: comissaoFixaCargo,
      percentual: comissaoFixaCargo,
      baseCalculo: valorBase,
      tipoCalculo: totalLoja ? "total_loja" : "por_cliente",
    };
  }

  // Escalonada: encontrar a faixa baseado no valor apropriado
  const faixa = policy.faixas.find(f => valorBase >= f.min && valorBase <= f.max);
  
  if (!faixa) {
    // Se valor acima de todas as faixas, usar última faixa
    const ultima = policy.faixas[policy.faixas.length - 1];
    if (ultima && valorBase > ultima.max) {
      return {
        comissaoBase: ultima.comissao,
        premio: ultima.premio,
        total: ultima.comissao + ultima.premio,
        percentual: ultima.comissao + ultima.premio,
        baseCalculo: valorBase,
        tipoCalculo: totalLoja ? "total_loja" : "por_cliente",
      };
    }
    return {
      comissaoBase: comissaoFixaCargo,
      premio: 0,
      total: comissaoFixaCargo,
      percentual: comissaoFixaCargo,
      baseCalculo: valorBase,
      tipoCalculo: totalLoja ? "total_loja" : "por_cliente",
    };
  }

  return {
    comissaoBase: faixa.comissao,
    premio: faixa.premio,
    total: faixa.comissao + faixa.premio,
    percentual: faixa.comissao + faixa.premio,
    baseCalculo: valorBase,
    tipoCalculo: totalLoja ? "total_loja" : "por_cliente",
  };
}
