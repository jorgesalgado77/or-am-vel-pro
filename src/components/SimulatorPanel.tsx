import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileDown, Lock, LockOpen } from "lucide-react";
import { calculateSimulation, formatCurrency, formatPercent, type FormaPagamento, type SimulationInput, type BoletoRateData } from "@/lib/financing";
import { generateSimulationPdf } from "@/lib/generatePdf";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useFinancingRates } from "@/hooks/useFinancingRates";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useDiscountOptions } from "@/hooks/useDiscountOptions";
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

const CARENCIA_OPTIONS: { value: "30" | "60" | "90"; label: string }[] = [
  { value: "30", label: "30 dias" },
  { value: "60", label: "60 dias" },
  { value: "90", label: "90 dias" },
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
  const [carenciaDias, setCarenciaDias] = useState<30 | 60 | 90>(30);
  const [saving, setSaving] = useState(false);
  const [desconto3Unlocked, setDesconto3Unlocked] = useState(false);
  const [plusUnlocked, setPlusUnlocked] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [pendingUnlock, setPendingUnlock] = useState<"desconto3" | "plus" | null>(null);

  const { settings } = useCompanySettings();
  const { hasPermission } = useCurrentUser();

  const { rates: boletoRates, providers: boletoProviders } = useFinancingRates("boleto");
  const { rates: creditoRates, providers: creditoProviders } = useFinancingRates("credito");

  const [selectedBoletoProvider, setSelectedBoletoProvider] = useState("");
  const [selectedCreditoProvider, setSelectedCreditoProvider] = useState("");

  useEffect(() => {
    if (boletoProviders.length > 0 && !selectedBoletoProvider) setSelectedBoletoProvider(boletoProviders[0]);
  }, [boletoProviders]);

  useEffect(() => {
    if (creditoProviders.length > 0 && !selectedCreditoProvider) setSelectedCreditoProvider(creditoProviders[0]);
  }, [creditoProviders]);

  const showParcelas = ["Credito", "Boleto", "Credito / Boleto"].includes(formaPagamento);
  const showPlus = ["A vista", "Pix"].includes(formaPagamento);
  const showCarencia = ["Boleto", "Credito / Boleto"].includes(formaPagamento);

  const currentBoletoRates = boletoRates.filter((r) => r.provider_name === selectedBoletoProvider);
  const currentCreditoRates = creditoRates.filter((r) => r.provider_name === selectedCreditoProvider);

  const maxBoletoInstallments = currentBoletoRates.length > 0 ? Math.max(...currentBoletoRates.map((r) => r.installments)) : 12;
  const maxCreditoInstallments = currentCreditoRates.length > 0 ? Math.max(...currentCreditoRates.map((r) => r.installments)) : 12;

  const maxParcelas = formaPagamento === "Boleto" ? maxBoletoInstallments
    : formaPagamento === "Credito" || formaPagamento === "Credito / Boleto" ? maxCreditoInstallments : 12;

  const boletoCoeffMap: Record<number, number> = {};
  const boletoRatesFullMap: Record<number, BoletoRateData> = {};
  currentBoletoRates.forEach((r) => {
    boletoCoeffMap[r.installments] = Number(r.coefficient);
    boletoRatesFullMap[r.installments] = {
      coefficient: Number(r.coefficient),
      taxa_fixa: Number(r.taxa_fixa),
      coeficiente_60: Number(r.coeficiente_60),
      coeficiente_90: Number(r.coeficiente_90),
    };
  });

  const creditoCoeffMap: Record<number, number> = {};
  currentCreditoRates.forEach((r) => { creditoCoeffMap[r.installments] = Number(r.coefficient); });

  const result = useMemo(() => {
    const input: SimulationInput = {
      valorTela, desconto1, desconto2, desconto3,
      formaPagamento, parcelas, valorEntrada, plusPercentual,
      creditRates: creditoCoeffMap,
      boletoRates: boletoCoeffMap,
      boletoRatesFull: boletoRatesFullMap,
      carenciaDias,
    };
    return calculateSimulation(input);
  }, [valorTela, desconto1, desconto2, desconto3, formaPagamento, parcelas, valorEntrada, plusPercentual, selectedBoletoProvider, selectedCreditoProvider, boletoRates, creditoRates, carenciaDias]);

  const requestUnlock = (field: "desconto3" | "plus") => {
    if (field === "desconto3" && hasPermission("desconto3")) { setDesconto3Unlocked(true); return; }
    if (field === "plus" && hasPermission("plus")) { setPlusUnlocked(true); return; }

    const requiredPassword = field === "desconto3" ? settings.manager_password : settings.admin_password;
    if (!requiredPassword) {
      if (field === "desconto3") setDesconto3Unlocked(true);
      else setPlusUnlocked(true);
      return;
    }
    setPendingUnlock(field);
    setPasswordInput("");
    setPasswordDialogOpen(true);
  };

  const handlePasswordConfirm = () => {
    const requiredPassword = pendingUnlock === "desconto3" ? settings.manager_password : settings.admin_password;
    if (passwordInput === requiredPassword) {
      if (pendingUnlock === "desconto3") setDesconto3Unlocked(true);
      else if (pendingUnlock === "plus") setPlusUnlocked(true);
      setPasswordDialogOpen(false);
      toast.success("Acesso liberado!");
    } else {
      toast.error("Senha incorreta");
    }
    setPasswordInput("");
  };

  const handleSave = async () => {
    if (!client) { toast.error("Selecione um cliente para salvar a simulação"); return; }
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
    if (error) toast.error("Erro ao salvar simulação");
    else toast.success("Simulação salva com sucesso!");
  };

  const passwordDialogTitle = pendingUnlock === "desconto3" ? "Senha do Gerente" : "Senha do Administrador";

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
        <Card>
          <CardHeader className="pb-4"><CardTitle className="text-base">Parâmetros da Simulação</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Valor de Tela</Label>
              <Input type="number" value={valorTela} onChange={(e) => setValorTela(Number(e.target.value))} min={0} step={100} className="mt-1" />
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
                <Label className="flex items-center gap-1">
                  Desconto 3 (%)
                  {!desconto3Unlocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                  {desconto3Unlocked && <LockOpen className="h-3 w-3 text-success" />}
                </Label>
                {desconto3Unlocked ? (
                  <Input type="number" value={desconto3} onChange={(e) => setDesconto3(Number(e.target.value))} min={0} max={100} step={0.5} className="mt-1" />
                ) : (
                  <Button variant="outline" size="sm" className="mt-1 w-full h-10 gap-1 text-muted-foreground" onClick={() => requestUnlock("desconto3")}>
                    <Lock className="h-3 w-3" />Desbloquear
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            <div>
              <Label>Forma de Pagamento</Label>
              <Select value={formaPagamento} onValueChange={(v) => { setFormaPagamento(v as FormaPagamento); setParcelas(1); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGAMENTO.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formaPagamento === "Boleto" && boletoProviders.length > 0 && (
              <div>
                <Label>Financeira</Label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {boletoProviders.map((p) => (
                    <Button key={p} size="sm" variant={selectedBoletoProvider === p ? "default" : "outline"} onClick={() => { setSelectedBoletoProvider(p); setParcelas(1); }}>
                      {p}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {(formaPagamento === "Credito" || formaPagamento === "Credito / Boleto") && creditoProviders.length > 0 && (
              <div>
                <Label>Operadora de Crédito</Label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {creditoProviders.map((p) => (
                    <Button key={p} size="sm" variant={selectedCreditoProvider === p ? "default" : "outline"} onClick={() => { setSelectedCreditoProvider(p); setParcelas(1); }}>
                      {p}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {showCarencia && (
              <div>
                <Label>Carência (dias)</Label>
                <Select value={String(carenciaDias)} onValueChange={(v) => setCarenciaDias(Number(v) as 30 | 60 | 90)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CARENCIA_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {showParcelas && (
              <div>
                <Label>Parcelas</Label>
                <Select value={String(parcelas)} onValueChange={(v) => setParcelas(Number(v))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: maxParcelas }, (_, i) => i + 1).map((n) => (
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
                <Label className="flex items-center gap-1">
                  Plus (%)
                  {!plusUnlocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                  {plusUnlocked && <LockOpen className="h-3 w-3 text-success" />}
                </Label>
                {plusUnlocked ? (
                  <Input type="number" value={plusPercentual} onChange={(e) => setPlusPercentual(Number(e.target.value))} min={0} max={100} step={0.5} className="mt-1" />
                ) : (
                  <Button variant="outline" size="sm" className="mt-1 w-full gap-1 text-muted-foreground" onClick={() => requestUnlock("plus")}>
                    <Lock className="h-3 w-3" />Desbloquear
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4"><CardTitle className="text-base">Resultado</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ResultRow label="Valor de Tela" value={formatCurrency(valorTela)} />
            <ResultRow label="Desconto Total" value={formatCurrency(valorTela - result.valorComDesconto)} muted />
            <ResultRow label="Valor com Desconto" value={formatCurrency(result.valorComDesconto)} />
            <Separator />
            <ResultRow label="Entrada" value={formatCurrency(valorEntrada)} />
            <ResultRow label="Saldo" value={formatCurrency(result.saldo)} />
            {result.taxaCredito > 0 && <ResultRow label="Taxa de Crédito" value={formatPercent(result.taxaCredito * 100)} muted />}
            {result.taxaBoleto > 0 && <ResultRow label="Coeficiente Boleto" value={result.taxaBoleto.toFixed(6)} muted />}
            {result.taxaFixaBoleto > 0 && <ResultRow label="Taxa Fixa Boleto" value={formatCurrency(result.taxaFixaBoleto)} muted />}
            {showCarencia && <ResultRow label="Carência" value={`${carenciaDias} dias`} muted />}
            <Separator />
            <div className="bg-primary/5 -mx-6 px-6 py-4 rounded-md">
              <ResultRow label="Valor Final" value={formatCurrency(result.valorFinal)} highlight />
              {showParcelas && <ResultRow label={`Parcela (${parcelas}x)`} value={formatCurrency(result.valorParcela)} highlight />}
            </div>

            {client && (
              <div className="flex gap-3 mt-4">
                <Button onClick={handleSave} disabled={saving} className="flex-1 bg-success hover:bg-success/90 text-success-foreground">
                  {saving ? "Salvando..." : "Salvar Simulação"}
                </Button>
                <Button variant="outline" className="gap-2" onClick={() =>
                  generateSimulationPdf({
                    clientName: client.nome,
                    clientCpf: client.cpf || undefined,
                    clientEmail: client.email || undefined,
                    clientPhone: client.telefone1 || undefined,
                    vendedor: client.vendedor || undefined,
                    companyName: settings.company_name,
                    companySubtitle: settings.company_subtitle || undefined,
                    companyLogoUrl: settings.logo_url || undefined,
                    valorTela, desconto1, desconto2, desconto3,
                    valorComDesconto: result.valorComDesconto,
                    formaPagamento, parcelas, valorEntrada, plusPercentual,
                    taxaCredito: result.taxaCredito,
                    saldo: result.saldo, valorFinal: result.valorFinal, valorParcela: result.valorParcela,
                  })
                }>
                  <FileDown className="h-4 w-4" />PDF
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lock className="h-4 w-4" />{passwordDialogTitle}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Informe a senha para desbloquear</Label>
            <Input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="mt-1"
              placeholder="Senha"
              onKeyDown={(e) => { if (e.key === "Enter") handlePasswordConfirm(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handlePasswordConfirm}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResultRow({ label, value, muted, highlight }: { label: string; value: string; muted?: boolean; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className={muted ? "text-sm text-muted-foreground" : highlight ? "text-sm font-semibold text-foreground" : "text-sm text-foreground"}>{label}</span>
      <span className={highlight ? "text-lg font-bold text-primary tabular-nums" : muted ? "text-sm text-muted-foreground tabular-nums" : "text-sm font-medium text-foreground tabular-nums"}>{value}</span>
    </div>
  );
}
