import {useState, useMemo, useCallback} from "react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Switch} from "@/components/ui/switch";
import {Label} from "@/components/ui/label";
import {Separator} from "@/components/ui/separator";
import {Brain, Shield, TrendingUp, Zap, Check, Target} from "lucide-react";
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
  currentFormaPagamento: string;
  onApplyStrategy: (strategy: StrategyParams) => void;
  calculateResult: (strategy: StrategyParams) => CalculatedResult;
  canAccess: boolean;
  historicalConversionRate?: number;
}

function calculateClosingProbability(
  discountPercent: number,
  hasFinancing: boolean,
  historicalRate: number,
  valorTotal: number
): number {
  let base = historicalRate > 0 ? historicalRate : 35;
  
  // More discount = higher probability
  if (discountPercent > 20) base += 25;
  else if (discountPercent > 10) base += 15;
  else if (discountPercent > 5) base += 8;
  
  // Financing availability increases probability
  if (hasFinancing) base += 10;
  
  // Higher values tend to have lower conversion
  if (valorTotal > 50000) base -= 5;
  if (valorTotal > 100000) base -= 8;
  
  return Math.min(Math.max(base, 10), 95);
}

export function AIStrategyPanel({
  valorTela,
  valorTelaComComissao,
  discountOptions,
  maxParcelas,
  currentFormaPagamento,
  onApplyStrategy,
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

    // CONSERVADORA: menor desconto, maior margem
    const conservD1 = d1Options.length > 0 ? Math.min(...d1Options.filter(v => v > 0)) || 0 : 0;
    const conservD2 = 0;
    const conservD3 = 0;
    const conservPlus = plusOptions.length > 0 ? Math.max(...plusOptions) : 0;
    const conservValor = valorTelaComComissao * (1 - conservD1 / 100);
    const conservMargem = ((valorTelaComComissao - conservValor + (conservValor * conservPlus / 100)) / valorTelaComComissao) * 100;
    const conservFinal = conservValor * (1 + conservPlus / 100);
    const conservProb = calculateClosingProbability(conservD1, false, historicalConversionRate, conservFinal);

    // COMERCIAL: desconto médio, equilíbrio
    const comD1 = d1Options.length > 1 ? d1Options[Math.floor(d1Options.length / 2)] : (d1Options[0] || 0);
    const comD2 = d2Options.length > 1 ? d2Options[Math.floor(d2Options.length / 2)] : (d2Options[0] || 0);
    const comD3 = 0;
    const comValor = valorTelaComComissao * (1 - comD1 / 100) * (1 - comD2 / 100);
    const totalDiscountCom = ((valorTelaComComissao - comValor) / valorTelaComComissao) * 100;
    const comMargem = 100 - totalDiscountCom;
    const comParcelas = Math.min(Math.ceil(maxParcelas / 2), maxParcelas);
    const comFinal = comValor;
    const comParcela = comFinal / comParcelas;
    const comProb = calculateClosingProbability(totalDiscountCom, true, historicalConversionRate, comFinal);

    // AGRESSIVA: maior desconto, condições facilitadas
    const agrD1 = d1Options.length > 0 ? Math.max(...d1Options) : 0;
    const agrD2 = d2Options.length > 0 ? Math.max(...d2Options) : 0;
    const agrD3 = d3Options.length > 0 ? Math.max(...d3Options) : 0;
    const agrValor = valorTelaComComissao * (1 - agrD1 / 100) * (1 - agrD2 / 100) * (1 - agrD3 / 100);
    const totalDiscountAgr = ((valorTelaComComissao - agrValor) / valorTelaComComissao) * 100;
    const agrMargem = 100 - totalDiscountAgr;
    const agrParcelas = maxParcelas;
    const agrFinal = agrValor;
    const agrParcela = agrFinal / agrParcelas;
    const agrProb = calculateClosingProbability(totalDiscountAgr, true, historicalConversionRate, agrFinal);

    return [
      {
        type: "conservadora",
        label: "Conservadora",
        icon: <Shield className="h-5 w-5" />,
        color: "text-emerald-700",
        bgColor: "bg-emerald-50",
        borderColor: "border-emerald-200 hover:border-emerald-400",
        desconto1: conservD1,
        desconto2: conservD2,
        desconto3: conservD3,
        plusPercentual: conservPlus,
        formaPagamento: "A vista",
        parcelas: 1,
        valorEntrada: 0,
        valorFinal: conservFinal,
        valorParcela: conservFinal,
        margemEstimada: conservMargem,
        probabilidadeFechamento: conservProb,
        descricao: "Menor desconto, máxima margem de lucro. Ideal para clientes já decididos.",
      },
      {
        type: "comercial",
        label: "Comercial",
        icon: <TrendingUp className="h-5 w-5" />,
        color: "text-amber-700",
        bgColor: "bg-amber-50",
        borderColor: "border-amber-200 hover:border-amber-400",
        desconto1: comD1,
        desconto2: comD2,
        desconto3: comD3,
        plusPercentual: 0,
        formaPagamento: "Boleto",
        parcelas: comParcelas,
        valorEntrada: 0,
        valorFinal: comFinal,
        valorParcela: comParcela,
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
        desconto1: agrD1,
        desconto2: agrD2,
        desconto3: agrD3,
        plusPercentual: 0,
        formaPagamento: "Boleto",
        parcelas: agrParcelas,
        valorEntrada: 0,
        valorFinal: agrFinal,
        valorParcela: agrParcela,
        margemEstimada: agrMargem,
        probabilidadeFechamento: agrProb,
        descricao: "Máximo desconto + parcelamento. Para fechar negócios difíceis.",
      },
    ];
  }, [enabled, valorTela, valorTelaComComissao, discountOptions, maxParcelas, historicalConversionRate]);

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
            {scenarios.map((scenario) => (
              <div
                key={scenario.type}
                className={`relative rounded-lg border-2 p-4 cursor-pointer transition-all duration-200 ${scenario.borderColor} ${scenario.bgColor} ${
                  selectedStrategy === scenario.type ? "ring-2 ring-primary ring-offset-1" : ""
                }`}
                onClick={() => handleApply(scenario)}
              >
                {selectedStrategy === scenario.type && (
                  <div className="absolute top-2 right-2">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                )}

                <div className="flex items-center gap-2 mb-2">
                  <span className={scenario.color}>{scenario.icon}</span>
                  <h4 className={`font-semibold text-sm ${scenario.color}`}>
                    {scenario.label}
                  </h4>
                </div>

                <p className="text-xs text-muted-foreground mb-3">
                  {scenario.descricao}
                </p>

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
