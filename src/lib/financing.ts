// Financing calculation library

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
  creditRates?: Record<number, number>;
  boletoRates?: Record<number, number>;
}

export interface SimulationResult {
  valorComDesconto: number;
  valorEntrada: number;
  saldo: number;
  valorFinal: number;
  valorParcela: number;
  taxaCredito: number;
  taxaBoleto: number;
}

export function calculateSimulation(input: SimulationInput): SimulationResult {
  const { valorTela, desconto1, desconto2, desconto3, formaPagamento, parcelas, valorEntrada, plusPercentual, creditRates = {}, boletoRates = {} } = input;

  const afterDiscount1 = valorTela * (1 - desconto1 / 100);
  const afterDiscount2 = afterDiscount1 * (1 - desconto2 / 100);
  const valorComDesconto = afterDiscount2 * (1 - desconto3 / 100);

  const saldo = valorComDesconto - valorEntrada;

  let valorFinal = saldo;
  let valorParcela = 0;
  let taxaCredito = 0;
  let taxaBoleto = 0;

  switch (formaPagamento) {
    case 'A vista':
    case 'Pix': {
      valorFinal = saldo * (1 + plusPercentual / 100);
      valorParcela = valorFinal;
      break;
    }
    case 'Credito': {
      taxaCredito = creditRates[parcelas] || 0;
      valorFinal = saldo * (1 + taxaCredito);
      valorParcela = parcelas > 0 ? valorFinal / parcelas : valorFinal;
      break;
    }
    case 'Boleto': {
      const coeff = boletoRates[parcelas] || 0;
      taxaBoleto = coeff;
      if (coeff > 0) {
        // Coefficient-based: parcela = saldo * coeficiente
        valorParcela = saldo * coeff;
        valorFinal = valorParcela * parcelas;
      } else {
        valorFinal = saldo;
        valorParcela = parcelas > 0 ? saldo / parcelas : saldo;
      }
      break;
    }
    case 'Credito / Boleto': {
      const halfCredit = saldo * 0.5;
      const halfBoleto = saldo * 0.5;
      taxaCredito = creditRates[parcelas] || 0;
      const creditTotal = halfCredit * (1 + taxaCredito);
      const bCoeff = boletoRates[parcelas] || 0;
      taxaBoleto = bCoeff;
      const boletoTotal = bCoeff > 0 ? (halfBoleto * bCoeff) * parcelas : halfBoleto;
      valorFinal = creditTotal + boletoTotal;
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
    taxaBoleto,
    valorParcela: Math.round(valorParcela * 100) / 100,
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}
