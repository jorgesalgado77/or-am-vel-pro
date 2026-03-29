/**
 * ArbitragePanel — Painel de Arbitragem de Negociação
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Gift, TrendingUp, TrendingDown, Shield, Zap, DollarSign,
  Check, Edit, Send, Loader2, AlertTriangle, Target, Percent,
} from "lucide-react";
import { useNegotiationArbitrage } from "@/hooks/useNegotiationArbitrage";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import type { ArbitrageScenario, ArbitrageScenarioType } from "@/services/commercial/NegotiationArbitrageEngine";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatCurrency(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const SCENARIO_CONFIG: Record<ArbitrageScenarioType, {
  icon: typeof Gift;
  gradient: string;
  border: string;
}> = {
  valor_maximo: {
    icon: Gift,
    gradient: "from-emerald-500/10 to-emerald-600/5",
    border: "border-emerald-500/30",
  },
  equilibrado: {
    icon: Target,
    gradient: "from-blue-500/10 to-blue-600/5",
    border: "border-blue-500/30",
  },
  agressivo: {
    icon: Zap,
    gradient: "from-amber-500/10 to-red-500/5",
    border: "border-amber-500/30",
  },
};

export function ArbitragePanel() {
  const { tenantId } = useTenant();
  const { user } = useAuth();
  const isAdmin = user?.cargo_nome === "Admin" || user?.cargo_nome === "Gerente";
  const {
    result, loading, selectedScenario,
    generateScenarios, approveScenario, editScenario, selectScenario,
  } = useNegotiationArbitrage();

  const [valorProposta, setValorProposta] = useState("");
  const [valorConcorrente, setValorConcorrente] = useState("");
  const [clientName, setClientName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDiscount, setEditDiscount] = useState("");

  const handleGenerate = async () => {
    const vp = parseFloat(valorProposta.replace(/[^\d.,]/g, "").replace(",", "."));
    if (!vp || vp <= 0) {
      toast.error("Informe o valor da proposta");
      return;
    }

    const vc = valorConcorrente
      ? parseFloat(valorConcorrente.replace(/[^\d.,]/g, "").replace(",", "."))
      : undefined;

    await generateScenarios({
      tenant_id: tenantId || "",
      user_id: user?.id,
      client_id: "manual",
      client_name: clientName || "Cliente",
      valor_proposta: vp,
      valor_concorrente: vc,
      estagio_venda: "em_negociacao",
      days_inactive: 0,
      has_simulation: true,
    });
  };

  const handleEdit = (scenario: ArbitrageScenario) => {
    if (editingId === scenario.id) {
      const newDisc = parseFloat(editDiscount);
      if (!isNaN(newDisc) && newDisc >= 0 && newDisc <= 100) {
        const newFinal = scenario.valor_proposta * (1 - newDisc / 100);
        editScenario(scenario.id, {
          desconto_percentual: newDisc,
          valor_final: Math.round(newFinal * 100) / 100,
        });
      }
      setEditingId(null);
      setEditDiscount("");
    } else {
      setEditingId(scenario.id);
      setEditDiscount(scenario.desconto_percentual.toString());
    }
  };

  return (
    <div className="space-y-4">
      {/* Input Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Motor de Arbitragem
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              placeholder="Nome do cliente"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="text-sm"
            />
            <Input
              placeholder="Valor da proposta (R$)"
              value={valorProposta}
              onChange={(e) => setValorProposta(e.target.value)}
              className="text-sm"
            />
            <Input
              placeholder="Valor concorrente (opcional)"
              value={valorConcorrente}
              onChange={(e) => setValorConcorrente(e.target.value)}
              className="text-sm"
            />
          </div>
          <Button onClick={handleGenerate} disabled={loading} className="w-full sm:w-auto" size="sm">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
            Gerar Cenários
          </Button>
        </CardContent>
      </Card>

      {/* GAP Analysis */}
      {result?.gap_analysis.has_competitor && (
        <Card className="border-amber-500/30">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Análise de GAP Competitivo</p>
                <p className="text-xs text-muted-foreground mt-1">
                  GAP: {formatCurrency(result.gap_analysis.gap_absoluto)} ({result.gap_analysis.gap_percentual}%)
                </p>
                <p className="text-xs text-muted-foreground">{result.gap_analysis.estrategia_sugerida}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendation */}
      {result && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4">
            <p className="text-sm">
              <span className="font-medium">💡 Recomendação IA:</span>{" "}
              {result.recommendation}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Scenarios */}
      {result && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {result.scenarios.map((scenario) => {
            const config = SCENARIO_CONFIG[scenario.type];
            const Icon = config.icon;
            const isSelected = selectedScenario?.id === scenario.id;
            const isBest = result.best_scenario === scenario.type;

            return (
              <Card
                key={scenario.id}
                className={cn(
                  "relative cursor-pointer transition-all hover:shadow-md",
                  config.border,
                  isSelected && "ring-2 ring-primary",
                  !scenario.margin_ok && "opacity-70"
                )}
                onClick={() => selectScenario(scenario.id)}
              >
                {isBest && (
                  <Badge className="absolute -top-2 right-3 text-[10px] bg-primary">
                    Recomendado
                  </Badge>
                )}

                <CardHeader className={cn("pb-2 rounded-t-lg bg-gradient-to-br", config.gradient)}>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {scenario.label}
                    {scenario.approved_by && (
                      <Badge variant="outline" className="text-[9px] ml-auto">
                        <Check className="h-3 w-3 mr-1" /> Aprovado
                      </Badge>
                    )}
                    {scenario.is_edited && (
                      <Badge variant="secondary" className="text-[9px]">Editado</Badge>
                    )}
                  </CardTitle>
                </CardHeader>

                <CardContent className="pt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">{scenario.description}</p>

                  {/* Price & Discount */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Valor Final</span>
                      <span className="font-bold">{formatCurrency(scenario.valor_final)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Percent className="h-3 w-3" /> Desconto
                      </span>
                      <span>{scenario.desconto_percentual}%</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <DollarSign className="h-3 w-3" /> Margem
                      </span>
                      <span className={cn(
                        scenario.margin_ok ? "text-emerald-600" : "text-destructive"
                      )}>
                        {scenario.margem_estimada}%
                      </span>
                    </div>
                  </div>

                  {/* Probability */}
                  <div className="flex items-center gap-2">
                    {scenario.closing_probability >= 50 ? (
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-amber-500" />
                    )}
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          scenario.closing_probability >= 60 ? "bg-emerald-500" :
                          scenario.closing_probability >= 40 ? "bg-amber-500" : "bg-destructive"
                        )}
                        style={{ width: `${scenario.closing_probability}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium">{scenario.closing_probability}%</span>
                  </div>

                  {/* Gifts */}
                  {scenario.gifts.length > 0 && (
                    <div className="border-t border-border pt-2">
                      <p className="text-xs font-medium flex items-center gap-1 mb-1">
                        <Gift className="h-3 w-3 text-primary" /> Brindes
                      </p>
                      {scenario.gifts.map((gift) => (
                        <div key={gift.product_id} className="flex items-center justify-between text-xs py-0.5">
                          <span className="truncate max-w-[60%]">{gift.name}</span>
                          <span className="text-muted-foreground">
                            Custo: {formatCurrency(gift.cost_price)} | Valor: {formatCurrency(gift.perceived_value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Margin Alert */}
                  {!scenario.margin_ok && (
                    <div className="flex items-center gap-1 text-xs text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      Margem abaixo do mínimo
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1 border-t border-border">
                    {isAdmin && scenario.requires_approval && !scenario.approved_by && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 flex-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          approveScenario(scenario.id, user?.id || "admin");
                        }}
                      >
                        <Check className="h-3 w-3 mr-1" /> Aprovar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(scenario);
                      }}
                    >
                      <Edit className="h-3 w-3 mr-1" /> {editingId === scenario.id ? "Salvar" : "Editar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        const msg = `${scenario.label}: ${formatCurrency(scenario.valor_final)}` +
                          (scenario.gifts.length > 0 ? ` + brinde ${scenario.gifts[0].name}` : "") +
                          ` em ${scenario.parcelas}x`;
                        navigator.clipboard.writeText(msg);
                        toast.success("Mensagem copiada!");
                      }}
                    >
                      <Send className="h-3 w-3 mr-1" /> Copiar
                    </Button>
                  </div>

                  {/* Edit inline */}
                  {editingId === scenario.id && (
                    <div className="pt-2 border-t border-border">
                      <Input
                        placeholder="Novo desconto %"
                        value={editDiscount}
                        onChange={(e) => setEditDiscount(e.target.value)}
                        className="text-xs h-7"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Shield className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Insira o valor da proposta para gerar cenários de arbitragem</p>
            <p className="text-xs mt-1">O motor compara brinde vs desconto para maximizar margem e conversão</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
