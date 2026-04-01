import {useState, useMemo, useCallback} from "react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Switch} from "@/components/ui/switch";
import {Label} from "@/components/ui/label";
import {Separator} from "@/components/ui/separator";
import {Brain, Shield, TrendingUp, Zap, Check, Target, Building2} from "lucide-react";
import {formatCurrency} from "@/lib/financing";
import {toast} from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell
} from "recharts";

interface StrategyScenario {
  type: "conservadora" | "comercial" | "agressiva";
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  desconto1: number;
  desconto2: number;
  desconto3: number;
  plusPercentual: number;
  formaPagamento: string;
  parcelas: number;
  valorEntrada: number;
  valorFinal: number;
  valorParcela: number;
  margemEstimada: number;
  probabilidadeFechamento: number;
  descricao: string;
}

interface StrategyParams {
  desconto1: number;
  desconto2: number;
  desconto3: number;
  plusPercentual: number;
  formaPagamento: string;
  parcelas: number;
  valorEntrada: number;
}

interface CalculatedResult {
  valorComDesconto: number;
  valorFinal: number;
  valorParcela: number;
  saldo: number;
}

interface AIStrategyPanelProps {
  valorTela: number;
  valorTelaComComissao: number;
  discountOptions: {
    desconto1: number[];
    desconto2: number[];
    desconto3: number[];
    plus: number[];
  };
  maxParcelas: number;
  availableParcelas: number[];
  currentFormaPagamento: string;
  boletoProviderName?: string;
  onApplyStrategy: (strategy: StrategyParams) => void;
  calculateResult: (strategy: StrategyParams) => CalculatedResult;
  canAccess: boolean;
  historicalConversionRate?: number;
}

// calculateClosingProbability now delegated to CommercialDecisionEngine
// Kept inline for backward compat with props-based usage in this component
function calculateClosingProbability(
  discountPercent: number,
  hasFinancing: boolean,
  historicalRate: number,
  valorTotal: number
): number {
  // Mirrors CommercialDecisionEngine.closingProbability (single source of truth logic)
  let base = historicalRate > 0 ? historicalRate : 35;
  if (discountPercent > 20) base += 25;
  else if (discountPercent > 10) base += 15;
  else if (discountPercent > 5) base += 8;
  if (hasFinancing) base += 10;
  if (valorTotal > 50000) base -= 5;
  if (valorTotal > 100000) base -= 8;
  return Math.min(Math.max(base, 10), 95);
}

export function AIStrategyPanel({
  valorTela,
  valorTelaComComissao,
  discountOptions,
  maxParcelas,
  availableParcelas,
  currentFormaPagamento,
  boletoProviderName,
  onApplyStrategy,
  calculateResult,
  canAccess,
  historicalConversionRate = 0,
}: AIStrategyPanelProps) {
  const [enabled, setEnabled] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);

  const scenarios = useMemo((): StrategyScenario[] => {
    if (!enabled || valorTela <= 0) return [];

    const d1Options = discountOptions.desconto1;
    const d2Options = discountOptions.desconto2;
    const d3Options = discountOptions.desconto3;
    const plusOptions = discountOptions.plus;

    // Build strategy params
    const conservD1 = d1Options.length > 0 ? Math.min(...d1Options.filter(v => v > 0)) || 0 : 0;
    const conservPlus = plusOptions.length > 0 ? Math.max(...plusOptions) : 0;

    const comD1 = d1Options.length > 1 ? d1Options[Math.floor(d1Options.length / 2)] : (d1Options[0] || 0);
    const comD2 = d2Options.length > 1 ? d2Options[Math.floor(d2Options.length / 2)] : (d2Options[0] || 0);
    // Pick middle available installment for Comercial, max for Agressiva
    const midIdx = Math.floor(availableParcelas.length / 2);
    const comParcelas = availableParcelas.length > 0 ? availableParcelas[midIdx] : 1;

    const agrD1 = d1Options.length > 0 ? Math.max(...d1Options) : 0;
    const agrD2 = d2Options.length > 0 ? Math.max(...d2Options) : 0;
    const agrD3 = d3Options.length > 0 ? Math.max(...d3Options) : 0;
    const agrParcelas = availableParcelas.length > 0 ? availableParcelas[availableParcelas.length - 1] : maxParcelas;

    // Define strategy params
    const conservParams: StrategyParams = {
      desconto1: conservD1, desconto2: 0, desconto3: 0,
      plusPercentual: conservPlus, formaPagamento: "A vista", parcelas: 1, valorEntrada: 0,
    };
    const comParams: StrategyParams = {
      desconto1: comD1, desconto2: comD2, desconto3: 0,
      plusPercentual: 0, formaPagamento: "Boleto", parcelas: comParcelas, valorEntrada: 0,
    };
    const agrParams: StrategyParams = {
      desconto1: agrD1, desconto2: agrD2, desconto3: agrD3,
      plusPercentual: 0, formaPagamento: "Boleto", parcelas: agrParcelas, valorEntrada: 0,
    };

    // Use the real calculation engine for accurate values
    const conservResult = calculateResult(conservParams);
    const comResult = calculateResult(comParams);
    const agrResult = calculateResult(agrParams);

    const totalDiscountConserv = ((valorTelaComComissao - conservResult.valorComDesconto) / valorTelaComComissao) * 100;
    const totalDiscountCom = ((valorTelaComComissao - comResult.valorComDesconto) / valorTelaComComissao) * 100;
    const totalDiscountAgr = ((valorTelaComComissao - agrResult.valorComDesconto) / valorTelaComComissao) * 100;

    const conservMargem = 100 - totalDiscountConserv + conservPlus;
    const comMargem = 100 - totalDiscountCom;
    const agrMargem = 100 - totalDiscountAgr;

    const conservProb = calculateClosingProbability(totalDiscountConserv, false, historicalConversionRate, conservResult.valorFinal);
    const comProb = calculateClosingProbability(totalDiscountCom, true, historicalConversionRate, comResult.valorFinal);
    const agrProb = calculateClosingProbability(totalDiscountAgr, true, historicalConversionRate, agrResult.valorFinal);

    return [
      {
        type: "conservadora",
        label: "Conservadora",
        icon: <Shield className="h-5 w-5" />,
        color: "text-emerald-700",
        bgColor: "bg-emerald-50",
        borderColor: "border-emerald-200 hover:border-emerald-400",
        ...conservParams,
        valorFinal: conservResult.valorFinal,
        valorParcela: conservResult.valorParcela,
        margemEstimada: conservMargem,
        probabilidadeFechamento: conservProb,
        descricao: conservPlus > 0 ? `Menor desconto + Plus ${conservPlus}%, máxima margem. Ideal para clientes já decididos.` : "Menor desconto, máxima margem de lucro. Ideal para clientes já decididos.",
      },
      {
        type: "comercial",
        label: "Comercial",
        icon: <TrendingUp className="h-5 w-5" />,
        color: "text-amber-700",
        bgColor: "bg-amber-50",
        borderColor: "border-amber-200 hover:border-amber-400",
        ...comParams,
        valorFinal: comResult.valorFinal,
        valorParcela: comResult.valorParcela,
        margemEstimada: comMargem,
        probabilidadeFechamento: comProb,
        descricao: "Equilíbrio entre desconto e lucro. Bom para negociações em andamento.",
      },
      {
        type: "agressiva",
        label: "Agressiva",
        icon: <Zap className="h-5 w-5" />,
        color: "text-red-700",
        bgColor: "bg-red-50",
        borderColor: "border-red-200 hover:border-red-400",
        ...agrParams,
        valorFinal: agrResult.valorFinal,
        valorParcela: agrResult.valorParcela,
        margemEstimada: agrMargem,
        probabilidadeFechamento: agrProb,
        descricao: "Máximo desconto + parcelamento. Para fechar negócios difíceis.",
      },
    ];
  }, [enabled, valorTela, valorTelaComComissao, discountOptions, maxParcelas, availableParcelas, historicalConversionRate, calculateResult]);

  const handleApply = useCallback((scenario: StrategyScenario) => {
    onApplyStrategy({
      desconto1: scenario.desconto1,
      desconto2: scenario.desconto2,
      desconto3: scenario.desconto3,
      plusPercentual: scenario.plusPercentual,
      formaPagamento: scenario.formaPagamento,
      parcelas: scenario.parcelas,
      valorEntrada: scenario.valorEntrada,
    });
    setSelectedStrategy(scenario.type);
    toast.success(`Estratégia ${scenario.label} aplicada!`);
  }, [onApplyStrategy]);

  if (!canAccess) return null;

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            IA de Estratégia
          </CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="ai-toggle" className="text-xs text-muted-foreground cursor-pointer">
              {enabled ? "Ativada" : "Desativada"}
            </Label>
            <Switch
              id="ai-toggle"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
        </div>
        {selectedStrategy && enabled && (
          <Badge variant="outline" className="w-fit text-xs mt-1">
            <Target className="h-3 w-3 mr-1" />
            Estratégia atual: {selectedStrategy.charAt(0).toUpperCase() + selectedStrategy.slice(1)}
          </Badge>
        )}
      </CardHeader>

      {enabled && valorTela > 0 && (
        <CardContent className="space-y-3 pt-0">
          {historicalConversionRate > 0 && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-xs">
              <Target className="h-3.5 w-3.5 text-primary" />
              <span className="text-muted-foreground">
                Taxa de conversão histórica: <span className="font-bold text-foreground">{historicalConversionRate.toFixed(1)}%</span>
              </span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Baseado nos seus descontos, condições de pagamento e histórico real de vendas:
          </p>

          <div className="grid grid-cols-1 gap-3">
            {scenarios
              .filter(s => !selectedStrategy || s.type === selectedStrategy)
              .map((scenario) => (
              <div
                key={scenario.type}
                className={`relative rounded-lg border-2 p-4 cursor-pointer transition-all duration-200 ${scenario.borderColor} ${scenario.bgColor} ${
                  selectedStrategy === scenario.type ? "ring-2 ring-primary ring-offset-1" : ""
                }`}
                onClick={() => {
                  if (selectedStrategy === scenario.type) {
                    setSelectedStrategy(null);
                  } else {
                    handleApply(scenario);
                  }
                }}
              >
                {selectedStrategy === scenario.type && (
                  <div className="absolute top-2 right-2 flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded border-2 border-primary bg-primary flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                    <span className="text-[10px] text-muted-foreground">Desmarcar</span>
                  </div>
                )}

                <div className="flex items-center gap-2 mb-2">
                  <span className={scenario.color}>{scenario.icon}</span>
                  <h4 className={`font-semibold text-sm ${scenario.color}`}>
                    {scenario.label}
                  </h4>
                </div>

                <p className="text-xs text-muted-foreground mb-2">
                  {scenario.descricao}
                </p>

                {scenario.formaPagamento === "Boleto" && boletoProviderName && (
                  <div className="flex items-center gap-1.5 mb-3 text-[10px] text-muted-foreground">
                    <Building2 className="h-3 w-3" />
                    <span>Financeira: <span className="font-semibold text-foreground">{boletoProviderName}</span></span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor Final:</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(scenario.valorFinal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Margem:</span>
                    <span className="font-semibold tabular-nums">{scenario.margemEstimada.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Descontos:</span>
                    <span className="tabular-nums">
                      {scenario.desconto1}% + {scenario.desconto2}% + {scenario.desconto3}%
                    </span>
                  </div>
                  {scenario.plusPercentual > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Plus:</span>
                      <span className="tabular-nums text-emerald-600 font-semibold">+{scenario.plusPercentual}%</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Parcelas:</span>
                    <span className="tabular-nums">
                      {scenario.parcelas > 1
                        ? `${scenario.parcelas}x ${formatCurrency(scenario.valorParcela)}`
                        : "À Vista"}
                    </span>
                  </div>
                </div>

                <Separator className="my-2" />

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Probabilidade de fechamento:</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2 rounded-full bg-black/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          scenario.probabilidadeFechamento > 70
                            ? "bg-emerald-500"
                            : scenario.probabilidadeFechamento > 45
                            ? "bg-amber-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${scenario.probabilidadeFechamento}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold tabular-nums">
                      {scenario.probabilidadeFechamento}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {scenarios.length > 0 && (
            <Card className="border bg-card/50">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs font-medium text-muted-foreground">Margem vs Probabilidade de Fechamento</CardTitle>
              </CardHeader>
              <CardContent className="px-1 pb-2">
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart
                    data={scenarios.map(s => ({
                      name: s.label,
                      margem: Number(s.margemEstimada.toFixed(1)),
                      probabilidade: s.probabilidadeFechamento,
                      type: s.type,
                    }))}
                    margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                    barGap={4}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
                    <Tooltip
                      formatter={(value: number, name: string) => [`${value}%`, name === "margem" ? "Margem" : "Prob. Fechamento"]}
                      contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    />
                    <Legend
                      formatter={(value) => value === "margem" ? "Margem" : "Prob. Fechamento"}
                      wrapperStyle={{ fontSize: 10 }}
                    />
                    <Bar dataKey="margem" radius={[4, 4, 0, 0]} maxBarSize={28}>
                      {scenarios.map((s) => (
                        <Cell
                          key={s.type}
                          fill={s.type === "conservadora" ? "hsl(152, 60%, 40%)" : s.type === "comercial" ? "hsl(40, 90%, 50%)" : "hsl(0, 70%, 50%)"}
                        />
                      ))}
                    </Bar>
                    <Bar dataKey="probabilidade" radius={[4, 4, 0, 0]} maxBarSize={28}>
                      {scenarios.map((s) => (
                        <Cell
                          key={s.type}
                          fill={s.type === "conservadora" ? "hsl(152, 60%, 60%)" : s.type === "comercial" ? "hsl(40, 90%, 70%)" : "hsl(0, 70%, 70%)"}
                          opacity={0.7}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <p className="text-[10px] text-muted-foreground text-center">
            Clique em um cenário para aplicar automaticamente os valores no orçamento
          </p>
        </CardContent>
      )}

      {enabled && valorTela <= 0 && (
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground text-center py-4">
            Importe um arquivo ou insira o valor de tela para gerar estratégias.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
