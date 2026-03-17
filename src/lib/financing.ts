// Credit card installment rates (Sunup)
const CREDIT_RATES: Record<number, number> = {
  1: 0.0285,
  2: 0.039,
  3: 0.049,
  4: 0.059,
  5: 0.069,
  6: 0.079,
  7: 0.089,
  8: 0.099,
  9: 0.099,
  10: 0.099,
  11: 0.099,
  12: 0.099,
};

export type FormaPagamento = 'A vista' | 'Boleto' | 'Credito' | 'Pix' | 'Credito / Boleto' | 'Entrada e Entrega';

export interface SimulationInput {
  valorTela: number;
  desconto1: number;
  desconto2: number;
  desconto3: number;
  formaPagamento: FormaPagamento;
  parcelas: number;
  valorEntrada: number;
  plusPercentual: number;
}

export interface SimulationResult {
  valorComDesconto: number;
  valorEntrada: number;
  saldo: number;
  valorFinal: number;
  valorParcela: number;
  taxaCredito: number;
}

export function calculateSimulation(input: SimulationInput): SimulationResult {
  const { valorTela, desconto1, desconto2, desconto3, formaPagamento, parcelas, valorEntrada, plusPercentual } = input;

  // Apply discounts sequentially
  const afterDiscount1 = valorTela * (1 - desconto1 / 100);
  const afterDiscount2 = afterDiscount1 * (1 - desconto2 / 100);
  const valorComDesconto = afterDiscount2 * (1 - desconto3 / 100);

  const saldo = valorComDesconto - valorEntrada;

  let valorFinal = saldo;
  let valorParcela = 0;
  let taxaCredito = 0;

  switch (formaPagamento) {
    case 'A vista':
    case 'Pix': {
      // Plus percentage applied
      valorFinal = saldo * (1 + plusPercentual / 100);
      valorParcela = valorFinal;
      break;
    }
    case 'Credito': {
      taxaCredito = CREDIT_RATES[parcelas] || 0;
      valorFinal = saldo * (1 + taxaCredito);
      valorParcela = parcelas > 0 ? valorFinal / parcelas : valorFinal;
      break;
    }
    case 'Boleto': {
      // Financing via boleto - simple split
      valorFinal = saldo;
      valorParcela = parcelas > 0 ? saldo / parcelas : saldo;
      break;
    }
    case 'Credito / Boleto': {
      // 50% credit, 50% boleto
      const halfCredit = saldo * 0.5;
      const halfBoleto = saldo * 0.5;
      taxaCredito = CREDIT_RATES[parcelas] || 0;
      const creditTotal = halfCredit * (1 + taxaCredito);
      valorFinal = creditTotal + halfBoleto;
      valorParcela = parcelas > 0 ? valorFinal / parcelas : valorFinal;
      break;
    }
    case 'Entrada e Entrega': {
      valorFinal = saldo;
      valorParcela = saldo;
      break;
    }
  }

  return {
    valorComDesconto,
    valorEntrada,
    saldo,
    valorFinal,
    taxaCredito,
    valorParcela: Math.round(valorParcela * 100) / 100,
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}
