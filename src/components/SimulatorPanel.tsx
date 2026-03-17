import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FileDown } from "lucide-react";
import { calculateSimulation, formatCurrency, formatPercent, type FormaPagamento, type SimulationInput } from "@/lib/financing";
import { generateSimulationPdf } from "@/lib/generatePdf";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

const FORMAS_PAGAMENTO: { value: FormaPagamento; label: string }[] = [
  { value: "A vista", label: "À Vista" },
  { value: "Pix", label: "Pix" },
  { value: "Credito", label: "Cartão de Crédito" },
  { value: "Boleto", label: "Boleto" },
  { value: "Credito / Boleto", label: "Crédito + Boleto" },
  { value: "Entrada e Entrega", label: "Entrada e Entrega" },
];

interface SimulatorPanelProps {
  client?: Client | null;
  onBack?: () => void;
}

export function SimulatorPanel({ client, onBack }: SimulatorPanelProps) {
  const [valorTela, setValorTela] = useState(10000);
  const [desconto1, setDesconto1] = useState(0);
  const [desconto2, setDesconto2] = useState(0);
  const [desconto3, setDesconto3] = useState(0);
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>("A vista");
  const [parcelas, setParcelas] = useState(1);
  const [valorEntrada, setValorEntrada] = useState(0);
  const [plusPercentual, setPlusPercentual] = useState(0);
  const [saving, setSaving] = useState(false);

  const showParcelas = ["Credito", "Boleto", "Credito / Boleto"].includes(formaPagamento);
  const showPlus = ["A vista", "Pix"].includes(formaPagamento);

  const result = useMemo(() => {
    const input: SimulationInput = {
      valorTela, desconto1, desconto2, desconto3,
      formaPagamento, parcelas, valorEntrada, plusPercentual,
    };
    return calculateSimulation(input);
  }, [valorTela, desconto1, desconto2, desconto3, formaPagamento, parcelas, valorEntrada, plusPercentual]);

  const handleSave = async () => {
    if (!client) {
      toast.error("Selecione um cliente para salvar a simulação");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("simulations").insert({
      client_id: client.id,
      valor_tela: valorTela,
      desconto1, desconto2, desconto3,
      forma_pagamento: formaPagamento,
      parcelas,
      valor_entrada: valorEntrada,
      plus_percentual: plusPercentual,
      valor_final: result.valorFinal,
      valor_parcela: result.valorParcela,
    });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar simulação");
    } else {
      toast.success("Simulação salva com sucesso!");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {client && onBack && (
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>← Voltar</Button>
          <span className="text-sm text-muted-foreground">
            Simulação para: <span className="font-medium text-foreground">{client.nome}</span>
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Parâmetros da Simulação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Valor de Tela</Label>
              <Input
                type="number"
                value={valorTela}
                onChange={(e) => setValorTela(Number(e.target.value))}
                min={0}
                step={100}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Desconto 1 (%)</Label>
                <Input type="number" value={desconto1} onChange={(e) => setDesconto1(Number(e.target.value))} min={0} max={100} step={0.5} className="mt-1" />
              </div>
              <div>
                <Label>Desconto 2 (%)</Label>
                <Input type="number" value={desconto2} onChange={(e) => setDesconto2(Number(e.target.value))} min={0} max={100} step={0.5} className="mt-1" />
              </div>
              <div>
                <Label>Desconto 3 (%)</Label>
                <Input type="number" value={desconto3} onChange={(e) => setDesconto3(Number(e.target.value))} min={0} max={100} step={0.5} className="mt-1" />
              </div>
            </div>

            <Separator />

            <div>
              <Label>Forma de Pagamento</Label>
              <Select value={formaPagamento} onValueChange={(v) => setFormaPagamento(v as FormaPagamento)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGAMENTO.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {showParcelas && (
              <div>
                <Label>Parcelas</Label>
                <Select value={String(parcelas)} onValueChange={(v) => setParcelas(Number(v))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Valor de Entrada</Label>
              <Input type="number" value={valorEntrada} onChange={(e) => setValorEntrada(Number(e.target.value))} min={0} step={100} className="mt-1" />
            </div>

            {showPlus && (
              <div>
                <Label>Plus (%)</Label>
                <Input type="number" value={plusPercentual} onChange={(e) => setPlusPercentual(Number(e.target.value))} min={0} max={100} step={0.5} className="mt-1" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Resultado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ResultRow label="Valor de Tela" value={formatCurrency(valorTela)} />
            <ResultRow label="Desconto Total" value={formatCurrency(valorTela - result.valorComDesconto)} muted />
            <ResultRow label="Valor com Desconto" value={formatCurrency(result.valorComDesconto)} />

            <Separator />

            <ResultRow label="Entrada" value={formatCurrency(valorEntrada)} />
            <ResultRow label="Saldo" value={formatCurrency(result.saldo)} />

            {result.taxaCredito > 0 && (
              <ResultRow label="Taxa de Crédito" value={formatPercent(result.taxaCredito * 100)} muted />
            )}

            <Separator />

            <div className="bg-primary/5 -mx-6 px-6 py-4 rounded-md">
              <ResultRow label="Valor Final" value={formatCurrency(result.valorFinal)} highlight />
              {showParcelas && (
                <ResultRow label={`Parcela (${parcelas}x)`} value={formatCurrency(result.valorParcela)} highlight />
              )}
            </div>

            {client && (
              <Button onClick={handleSave} disabled={saving} className="w-full mt-4 bg-success hover:bg-success/90 text-success-foreground">
                {saving ? "Salvando..." : "Salvar Simulação"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ResultRow({ label, value, muted, highlight }: { label: string; value: string; muted?: boolean; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className={muted ? "text-sm text-muted-foreground" : highlight ? "text-sm font-semibold text-foreground" : "text-sm text-foreground"}>
        {label}
      </span>
      <span className={highlight ? "text-lg font-bold text-primary tabular-nums" : muted ? "text-sm text-muted-foreground tabular-nums" : "text-sm font-medium text-foreground tabular-nums"}>
        {value}
      </span>
    </div>
  );
}
