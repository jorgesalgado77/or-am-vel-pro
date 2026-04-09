/**
 * ProductPromotionModal — Create/edit product promotions with payment conditions
 */
import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tag, Percent, Calendar, CreditCard, FileText, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { useFinancingRates, type FinancingRate } from "@/hooks/useFinancingRates";
import { toast } from "sonner";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const PAYMENT_CONDITIONS = [
  { id: "pix_avista", label: "Pix à Vista", group: "avista" },
  { id: "credito_avista", label: "Crédito à Vista", group: "avista" },
  { id: "boleto_avista", label: "Boleto à Vista", group: "avista" },
  { id: "boleto_prazo", label: "Boleto à Prazo", group: "boleto" },
  { id: "credito_prazo_juros", label: "Crédito à Prazo com Juros", group: "credito" },
  { id: "credito_prazo_sem_juros", label: "Crédito à Prazo SEM Juros", group: "credito" },
] as const;

interface ProviderSelection {
  providerName: string;
  selectedInstallments: number[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string;
  productName: string;
  currentPrice: number;
}

export function ProductPromotionModal({ open, onOpenChange, productId, productName, currentPrice }: Props) {
  const [desconto, setDesconto] = useState(0);
  const [validade, setValidade] = useState("");
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [creditoSelections, setCreditoSelections] = useState<ProviderSelection[]>([]);
  const [boletoSelections, setBoletoSelections] = useState<ProviderSelection[]>([]);
  const [saving, setSaving] = useState(false);
  const [existingPromo, setExistingPromo] = useState<any>(null);
  const [loadingPromo, setLoadingPromo] = useState(false);

  const { rates: allRates } = useFinancingRates();

  const creditoRates = useMemo(() => allRates.filter(r => r.provider_type === "credito" && r.is_active !== false), [allRates]);
  const boletoRates = useMemo(() => allRates.filter(r => r.provider_type === "boleto" && r.is_active !== false), [allRates]);

  const creditoProviders = useMemo(() => [...new Set(creditoRates.map(r => r.provider_name))], [creditoRates]);
  const boletoProviders = useMemo(() => [...new Set(boletoRates.map(r => r.provider_name))], [boletoRates]);

  const valorPromocional = currentPrice * (1 - desconto / 100);

  const needsCredito = selectedConditions.some(c => c.startsWith("credito_prazo"));
  const needsBoleto = selectedConditions.includes("boleto_prazo");

  // Load existing promotion
  useEffect(() => {
    if (!open || !productId) return;
    setLoadingPromo(true);
    const tenantId = getTenantId();
    supabase
      .from("product_promotions" as any)
      .select("*")
      .eq("product_id", productId)
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const promo = (data as any[])?.[0];
        if (promo) {
          setExistingPromo(promo);
          setDesconto(Number(promo.desconto_percentual) || 0);
          setValidade(promo.validade ? promo.validade.slice(0, 16) : "");
          setSelectedConditions(promo.condicoes_pagamento || []);
          setCreditoSelections(promo.credito_config || []);
          setBoletoSelections(promo.boleto_config || []);
        } else {
          resetForm();
        }
        setLoadingPromo(false);
      });
  }, [open, productId]);

  const resetForm = () => {
    setExistingPromo(null);
    setDesconto(0);
    setValidade("");
    setSelectedConditions([]);
    setCreditoSelections([]);
    setBoletoSelections([]);
  };

  const toggleCondition = (id: string) => {
    setSelectedConditions(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const toggleProviderInstallment = (
    type: "credito" | "boleto",
    providerName: string,
    installment: number
  ) => {
    const setter = type === "credito" ? setCreditoSelections : setBoletoSelections;
    setter(prev => {
      const existing = prev.find(p => p.providerName === providerName);
      if (!existing) {
        return [...prev, { providerName, selectedInstallments: [installment] }];
      }
      const newInstallments = existing.selectedInstallments.includes(installment)
        ? existing.selectedInstallments.filter(i => i !== installment)
        : [...existing.selectedInstallments, installment];
      if (newInstallments.length === 0) return prev.filter(p => p.providerName !== providerName);
      return prev.map(p => p.providerName === providerName ? { ...p, selectedInstallments: newInstallments } : p);
    });
  };

  const isInstallmentSelected = (type: "credito" | "boleto", providerName: string, installment: number) => {
    const selections = type === "credito" ? creditoSelections : boletoSelections;
    return selections.find(p => p.providerName === providerName)?.selectedInstallments.includes(installment) || false;
  };

  const getInstallmentValue = (rate: FinancingRate, type: "credito" | "boleto", withInterest: boolean) => {
    if (type === "credito" && !withInterest) {
      return valorPromocional / rate.installments;
    }
    if (rate.coefficient > 0) {
      return valorPromocional * rate.coefficient;
    }
    return valorPromocional / rate.installments;
  };

  const handleSave = async () => {
    if (desconto <= 0 || desconto > 100) { toast.error("Informe um desconto válido (1-100%)"); return; }
    if (!validade) { toast.error("Informe a validade da promoção"); return; }
    if (selectedConditions.length === 0) { toast.error("Selecione ao menos uma condição de pagamento"); return; }
    if (new Date(validade) <= new Date()) { toast.error("A validade deve ser uma data futura"); return; }

    setSaving(true);
    const tenantId = getTenantId();

    const payload = {
      tenant_id: tenantId,
      product_id: productId,
      desconto_percentual: desconto,
      valor_original: currentPrice,
      valor_promocional: valorPromocional,
      validade: new Date(validade).toISOString(),
      condicoes_pagamento: selectedConditions,
      credito_config: creditoSelections,
      boleto_config: boletoSelections,
      ativo: true,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (existingPromo) {
      ({ error } = await supabase.from("product_promotions" as any).update(payload as any).eq("id", existingPromo.id));
    } else {
      ({ error } = await supabase.from("product_promotions" as any).insert(payload as any));
    }

    if (error) {
      toast.error("Erro ao salvar promoção: " + error.message);
    } else {
      toast.success(existingPromo ? "Promoção atualizada!" : "Promoção criada!");
      onOpenChange(false);
    }
    setSaving(false);
  };

  const handleDeactivate = async () => {
    if (!existingPromo || !confirm("Desativar esta promoção? O preço voltará ao original.")) return;
    const { error } = await supabase.from("product_promotions" as any).update({ ativo: false } as any).eq("id", existingPromo.id);
    if (error) toast.error("Erro ao desativar");
    else {
      toast.success("Promoção desativada!");
      resetForm();
      onOpenChange(false);
    }
  };

  const renderProviderRates = (
    type: "credito" | "boleto",
    providers: string[],
    rates: FinancingRate[]
  ) => {
    const withInterest = type === "credito"
      ? selectedConditions.includes("credito_prazo_juros")
      : true;
    const withoutInterest = type === "credito"
      ? selectedConditions.includes("credito_prazo_sem_juros")
      : false;

    return (
      <div className="space-y-3 mt-2">
        {providers.map(provider => {
          const providerRates = rates
            .filter(r => r.provider_name === provider)
            .sort((a, b) => a.installments - b.installments);

          return (
            <Card key={provider} className="bg-muted/30">
              <CardContent className="p-3">
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  {type === "credito" ? <CreditCard className="h-3.5 w-3.5 text-primary" /> : <FileText className="h-3.5 w-3.5 text-primary" />}
                  {provider}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {providerRates.map(rate => {
                    const selected = isInstallmentSelected(type, provider, rate.installments);
                    const parcelaComJuros = getInstallmentValue(rate, type, true);
                    const parcelaSemJuros = getInstallmentValue(rate, type, false);

                    return (
                      <button
                        key={rate.id}
                        onClick={() => toggleProviderInstallment(type, provider, rate.installments)}
                        className={`text-left p-2 rounded-md border text-[11px] transition-colors ${
                          selected
                            ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                            : "border-border hover:bg-muted/60"
                        }`}
                      >
                        <span className="font-semibold">{rate.installments}x</span>
                        {withInterest && (
                          <div className="text-[10px] text-muted-foreground">
                            c/ juros: {formatBRL(parcelaComJuros)}
                          </div>
                        )}
                        {withoutInterest && type === "credito" && (
                          <div className="text-[10px] text-muted-foreground">
                            s/ juros: {formatBRL(parcelaSemJuros)}
                          </div>
                        )}
                        {type === "boleto" && rate.coefficient > 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            Coef: {rate.coefficient.toFixed(6)}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {providers.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">
            Nenhuma {type === "credito" ? "operadora de crédito" : "financeira de boleto"} cadastrada.
            Cadastre em Configurações.
          </p>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90dvh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2 shrink-0">
          <DialogTitle className="text-base flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" />
            {existingPromo ? "Editar Promoção" : "Criar Promoção"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground truncate">{productName}</p>
        </DialogHeader>

        <ScrollArea className="flex-1 px-4 sm:px-6" style={{ maxHeight: "calc(90dvh - 140px)" }}>
          {loadingPromo ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4 pb-4">
              {/* Pricing */}
              <Card className="bg-muted/30">
                <CardContent className="p-3 space-y-3">
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    <Percent className="h-3.5 w-3.5 text-primary" />
                    Precificação Promocional
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Valor Atual</Label>
                      <div className="mt-1 h-9 flex items-center text-sm font-medium bg-muted rounded-md px-3 border">
                        {formatBRL(currentPrice)}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Desconto (%)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={desconto || ""}
                        onChange={e => setDesconto(Number(e.target.value))}
                        className="mt-1 h-9 text-sm"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Valor Promocional</Label>
                      <div className="mt-1 h-9 flex items-center text-sm font-bold text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400 rounded-md px-3 border border-green-200 dark:border-green-800">
                        {formatBRL(valorPromocional)}
                      </div>
                    </div>
                  </div>
                  {desconto > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      Economia de {formatBRL(currentPrice - valorPromocional)} ({desconto}% off)
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Validity */}
              <div>
                <Label className="text-xs flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Validade da Promoção
                </Label>
                <Input
                  type="datetime-local"
                  value={validade}
                  onChange={e => setValidade(e.target.value)}
                  className="mt-1 h-9 text-sm"
                  min={new Date().toISOString().slice(0, 16)}
                />
                {validade && new Date(validade) > new Date() && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Expira em {Math.ceil((new Date(validade).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} dia(s).
                    Após expirar, volta ao preço original automaticamente.
                  </p>
                )}
              </div>

              <Separator />

              {/* Payment Conditions */}
              <div>
                <Label className="text-xs font-semibold mb-2 block">Condições de Pagamento Promocional</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PAYMENT_CONDITIONS.map(cond => (
                    <label
                      key={cond.id}
                      className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors text-xs ${
                        selectedConditions.includes(cond.id)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        checked={selectedConditions.includes(cond.id)}
                        onCheckedChange={() => toggleCondition(cond.id)}
                      />
                      {cond.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Credit providers */}
              {needsCredito && (
                <div>
                  <Separator className="mb-3" />
                  <Label className="text-xs font-semibold flex items-center gap-1.5 mb-1">
                    <CreditCard className="h-3.5 w-3.5 text-primary" />
                    Operadoras de Crédito — Selecione parcelas
                  </Label>
                  {renderProviderRates("credito", creditoProviders, creditoRates)}
                </div>
              )}

              {/* Boleto providers */}
              {needsBoleto && (
                <div>
                  <Separator className="mb-3" />
                  <Label className="text-xs font-semibold flex items-center gap-1.5 mb-1">
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    Financeiras (Boleto) — Selecione parcelas
                  </Label>
                  {renderProviderRates("boleto", boletoProviders, boletoRates)}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="px-4 sm:px-6 py-3 border-t shrink-0 flex-row gap-2">
          {existingPromo && (
            <Button variant="destructive" size="sm" onClick={handleDeactivate} className="mr-auto gap-1.5">
              <Trash2 className="h-3.5 w-3.5" />
              Desativar
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {existingPromo ? "Atualizar" : "Criar Promoção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
