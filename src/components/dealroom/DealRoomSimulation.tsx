import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Calculator, FileDown, Send, Edit3, Save, ArrowLeft, Clock,
  DollarSign, Percent, CreditCard, RefreshCw, CheckCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency } from "@/lib/financing";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { generateSimulationPdf } from "@/lib/generatePdf";
import type { Database } from "@/integrations/supabase/types";

const VALOR_MAX = 50_000_000;

type Simulation = Database["public"]["Tables"]["simulations"]["Row"];

interface DealRoomSimulationProps {
  tenantId: string;
  clientId?: string;
  clientName?: string;
  proposalValue?: number;
  onSendAsProposal?: (valor: number, descricao: string) => void;
}

const FORMA_LABELS: Record<string, string> = {
  "A vista": "À Vista",
  Pix: "Pix",
  Credito: "Cartão de Crédito",
  Boleto: "Boleto",
  "Credito / Boleto": "Crédito + Boleto",
  "Entrada e Entrega": "Entrada e Entrega",
};

export function DealRoomSimulation({ tenantId, clientId, clientName, onSendAsProposal }: DealRoomSimulationProps) {
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSim, setSelectedSim] = useState<Simulation | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    valor_tela: "",
    desconto1: "",
    desconto2: "",
    desconto3: "",
    forma_pagamento: "",
    parcelas: "",
    valor_entrada: "",
  });
  const [saving, setSaving] = useState(false);

  const loadSimulations = async () => {
    if (!clientId) { 
      console.warn("[DealRoomSimulation] No clientId provided");
      setLoading(false); 
      return; 
    }
    setLoading(true);
    const query = supabase
      .from("simulations")
      .select("*")
      .eq("client_id", clientId);
    
    // Also filter by tenant if available
    if (tenantId) {
      query.eq("tenant_id", tenantId);
    }
    
    const { data, error } = await query.order("created_at", { ascending: false });
    
    if (error) {
      console.error("[DealRoomSimulation] Error loading simulations:", error);
    }
    setSimulations(data || []);
    setLoading(false);
  };

  useEffect(() => { loadSimulations(); }, [clientId, tenantId]);

  const calcValorComDesconto = (s: { valor_tela: string; desconto1: string; desconto2: string; desconto3: string }) => {
    const vt = typeof s.valor_tela === "string" && s.valor_tela.includes("R$") ? unmaskCurrency(s.valor_tela) : (Number(s.valor_tela) || 0);
    const d1 = Number(s.desconto1) || 0;
    const d2 = Number(s.desconto2) || 0;
    const d3 = Number(s.desconto3) || 0;
    const after1 = vt * (1 - d1 / 100);
    const after2 = after1 * (1 - d2 / 100);
    return after2 * (1 - d3 / 100);
  };

  const startEdit = (sim: Simulation) => {
    setSelectedSim(sim);
    setEditing(true);
    setEditForm({
      valor_tela: maskCurrency(String(Math.round((Number(sim.valor_tela) || 0) * 100))),
      desconto1: String(sim.desconto1 || 0),
      desconto2: String(sim.desconto2 || 0),
      desconto3: String(sim.desconto3 || 0),
      forma_pagamento: sim.forma_pagamento || "A vista",
      parcelas: String(sim.parcelas || 1),
      valor_entrada: maskCurrency(String(Math.round((Number(sim.valor_entrada) || 0) * 100))),
    });
  };

  const handleCurrencyChange = (field: "valor_tela" | "valor_entrada") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = unmaskCurrency(e.target.value);
    if (raw > VALOR_MAX) {
      toast.error(`Valor máximo: ${formatCurrency(VALOR_MAX)}`);
      setEditForm(p => ({ ...p, [field]: maskCurrency(String(Math.round(VALOR_MAX * 100))) }));
      return;
    }
    setEditForm(p => ({ ...p, [field]: maskCurrency(e.target.value) }));
  };

  const saveEdit = async () => {
    if (!selectedSim) return;

    const valorTela = unmaskCurrency(editForm.valor_tela);
    const valorEntrada = unmaskCurrency(editForm.valor_entrada);

    if (valorTela <= 0) {
      toast.error("Valor de Tela deve ser maior que zero");
      return;
    }

    const valorComDesconto = calcValorComDesconto(editForm);

    if (valorEntrada < 0) {
      toast.error("Valor de Entrada não pode ser negativo");
      return;
    }
    if (valorEntrada > valorComDesconto) {
      toast.error("Valor de Entrada não pode ser maior que o valor com desconto");
      return;
    }

    setSaving(true);
    const saldo = valorComDesconto - valorEntrada;
    const parcelas = Number(editForm.parcelas) || 1;
    const valorParcela = parcelas > 0 ? saldo / parcelas : saldo;

    const { error } = await supabase
      .from("simulations")
      .update({
        valor_tela: valorTela,
        desconto1: Number(editForm.desconto1) || 0,
        desconto2: Number(editForm.desconto2) || 0,
        desconto3: Number(editForm.desconto3) || 0,
        forma_pagamento: editForm.forma_pagamento,
        parcelas,
        valor_entrada: valorEntrada,
        valor_final: valorComDesconto,
        valor_parcela: valorParcela,
      })
      .eq("id", selectedSim.id);

    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar simulação");
    } else {
      toast.success("Simulação atualizada!");
      setEditing(false);
      loadSimulations();
      setSelectedSim(prev => prev ? {
        ...prev,
        valor_tela: valorTela,
        desconto1: Number(editForm.desconto1) || 0,
        desconto2: Number(editForm.desconto2) || 0,
        desconto3: Number(editForm.desconto3) || 0,
        forma_pagamento: editForm.forma_pagamento,
        parcelas,
        valor_entrada: valorEntrada,
        valor_final: valorComDesconto,
        valor_parcela: valorParcela,
      } : null);
    }
  };

  const handleSendAsProposal = () => {
    if (!selectedSim || !onSendAsProposal) return;
    const valor = Number(selectedSim.valor_final) || Number(selectedSim.valor_tela) || 0;
    const desc = `Simulação ${clientName || ""} — ${FORMA_LABELS[selectedSim.forma_pagamento] || selectedSim.forma_pagamento} ${selectedSim.parcelas || 1}x`;
    onSendAsProposal(valor, desc);
    toast.success("Simulação enviada como proposta!");
  };

  const handleDownloadPdf = (sim: Simulation) => {
    const vcd = calcValorComDesconto({
      valor_tela: String(sim.valor_tela),
      desconto1: String(sim.desconto1 || 0),
      desconto2: String(sim.desconto2 || 0),
      desconto3: String(sim.desconto3 || 0),
    });
    generateSimulationPdf({
      clientName: clientName || "Cliente",
      valorTela: Number(sim.valor_tela),
      desconto1: Number(sim.desconto1) || 0,
      desconto2: Number(sim.desconto2) || 0,
      desconto3: Number(sim.desconto3) || 0,
      valorComDesconto: vcd,
      formaPagamento: sim.forma_pagamento,
      parcelas: sim.parcelas || 1,
      valorEntrada: Number(sim.valor_entrada) || 0,
      plusPercentual: Number(sim.plus_percentual) || 0,
      taxaCredito: 0,
      saldo: vcd - (Number(sim.valor_entrada) || 0),
      valorFinal: Number(sim.valor_final) || 0,
      valorParcela: Number(sim.valor_parcela) || 0,
      date: sim.created_at,
    });
  };

  if (!clientId) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Calculator className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          Selecione um cliente ao iniciar a sala para visualizar suas simulações
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Detail view of a selected simulation
  if (selectedSim) {
    const valorDesc = calcValorComDesconto({
      valor_tela: String(editing ? editForm.valor_tela : selectedSim.valor_tela),
      desconto1: String(editing ? editForm.desconto1 : (selectedSim.desconto1 || 0)),
      desconto2: String(editing ? editForm.desconto2 : (selectedSim.desconto2 || 0)),
      desconto3: String(editing ? editForm.desconto3 : (selectedSim.desconto3 || 0)),
    });
    const entrada = editing ? unmaskCurrency(editForm.valor_entrada) : Number(selectedSim.valor_entrada) || 0;
    const saldo = valorDesc - entrada;

    return (
      <div className="space-y-3 p-1">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => { setSelectedSim(null); setEditing(false); }}>
            <ArrowLeft className="h-3 w-3" /> Voltar
          </Button>
          <span className="text-xs text-muted-foreground">
            {format(new Date(selectedSim.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
          </span>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-2">
          <Card>
            <CardContent className="p-2 text-center">
              <p className="text-[9px] text-muted-foreground">Valor de Tela</p>
              <p className="text-sm font-bold text-foreground">
                {formatCurrency(Number(editing ? editForm.valor_tela : selectedSim.valor_tela))}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-2 text-center">
              <p className="text-[9px] text-muted-foreground">Valor Final</p>
              <p className="text-sm font-bold text-primary">{formatCurrency(valorDesc)}</p>
            </CardContent>
          </Card>
        </div>

        {editing ? (
          <ScrollArea className="h-[320px]">
            <div className="space-y-3 pr-2">
              <div>
                <Label className="text-xs">Valor de Tela</Label>
                <Input inputMode="numeric" className="h-8 text-sm mt-1" value={editForm.valor_tela}
                  onChange={handleCurrencyChange("valor_tela")} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px]">Desc. 1 (%)</Label>
                  <Input type="number" className="h-8 text-sm mt-1" value={editForm.desconto1}
                    onChange={e => setEditForm(p => ({ ...p, desconto1: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-[10px]">Desc. 2 (%)</Label>
                  <Input type="number" className="h-8 text-sm mt-1" value={editForm.desconto2}
                    onChange={e => setEditForm(p => ({ ...p, desconto2: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-[10px]">Desc. 3 (%)</Label>
                  <Input type="number" className="h-8 text-sm mt-1" value={editForm.desconto3}
                    onChange={e => setEditForm(p => ({ ...p, desconto3: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Forma de Pagamento</Label>
                <Select value={editForm.forma_pagamento} onValueChange={v => setEditForm(p => ({ ...p, forma_pagamento: v }))}>
                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A vista">À Vista</SelectItem>
                    <SelectItem value="Pix">Pix</SelectItem>
                    <SelectItem value="Credito">Cartão de Crédito</SelectItem>
                    <SelectItem value="Boleto">Boleto</SelectItem>
                    <SelectItem value="Credito / Boleto">Crédito + Boleto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Parcelas</Label>
                  <Input type="number" className="h-8 text-sm mt-1" value={editForm.parcelas}
                    onChange={e => setEditForm(p => ({ ...p, parcelas: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Entrada</Label>
                  <Input inputMode="numeric" className="h-8 text-sm mt-1" value={editForm.valor_entrada}
                    onChange={handleCurrencyChange("valor_entrada")} />
                </div>
              </div>

              {/* Live preview */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Com descontos</span>
                    <span className="font-semibold">{formatCurrency(valorDesc)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Entrada</span>
                    <span>{formatCurrency(entrada)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Saldo</span>
                    <span>{formatCurrency(saldo)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold border-t pt-1">
                    <span>Parcela</span>
                    <span className="text-primary">
                      {Number(editForm.parcelas) || 1}x de {formatCurrency(saldo / (Number(editForm.parcelas) || 1))}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Button className="flex-1 h-8 text-xs gap-1" onClick={saveEdit} disabled={saving}>
                  {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Salvar
                </Button>
                <Button variant="outline" className="h-8 text-xs" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="space-y-3">
            {/* Read-only details */}
            <div className="space-y-1.5">
              {[
                { label: "Forma Pagamento", value: FORMA_LABELS[selectedSim.forma_pagamento] || selectedSim.forma_pagamento, icon: CreditCard },
                { label: "Descontos", value: `${selectedSim.desconto1 || 0}% + ${selectedSim.desconto2 || 0}% + ${selectedSim.desconto3 || 0}%`, icon: Percent },
                { label: "Parcelas", value: `${selectedSim.parcelas || 1}x de ${formatCurrency(Number(selectedSim.valor_parcela) || 0)}`, icon: Calculator },
                { label: "Entrada", value: formatCurrency(entrada), icon: DollarSign },
                { label: "Saldo", value: formatCurrency(saldo), icon: DollarSign },
              ].map(f => (
                <div key={f.label} className="flex items-center justify-between text-xs py-1 border-b border-border/50">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <f.icon className="h-3 w-3" /> {f.label}
                  </span>
                  <span className="font-medium text-foreground">{f.value}</span>
                </div>
              ))}
            </div>

            {/* Ambientes importados */}
            {selectedSim.arquivo_nome && (() => {
              try {
                const envs = JSON.parse(selectedSim.arquivo_nome as string);
                if (Array.isArray(envs) && envs.length > 0) {
                  return (
                    <Card>
                      <CardContent className="p-2 space-y-1">
                        <p className="text-[10px] font-semibold text-muted-foreground">Ambientes Importados</p>
                        {envs.map((env: any, i: number) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="truncate max-w-[180px]">{env.environmentName || env.name || env.fileName || "Ambiente"}</span>
                            {env.value != null && <span className="font-mono">{formatCurrency(Number(env.value))}</span>}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  );
                }
              } catch { /* not JSON */ }
              return null;
            })()}

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={() => startEdit(selectedSim)}>
                <Edit3 className="h-3 w-3" /> Editar Simulação
              </Button>
              <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={() => handleDownloadPdf(selectedSim)}>
                <FileDown className="h-3 w-3" /> Baixar PDF
              </Button>
              {onSendAsProposal && (
                <Button size="sm" className="w-full gap-1.5 text-xs" onClick={handleSendAsProposal}>
                  <Send className="h-3 w-3" /> Enviar como Proposta
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Simulations list
  return (
    <div className="space-y-3 p-1">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Calculator className="h-3.5 w-3.5 text-primary" />
          Simulações de {clientName || "Cliente"}
        </h4>
        <Badge variant="secondary" className="text-[10px]">{simulations.length}</Badge>
      </div>

      {simulations.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Calculator className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              Nenhuma simulação salva para este cliente
            </p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="space-y-2 pr-2">
            {simulations.map(sim => (
              <Card key={sim.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedSim(sim)}>
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[9px]">
                      {FORMA_LABELS[sim.forma_pagamento] || sim.forma_pagamento}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {format(new Date(sim.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[9px] text-muted-foreground">Valor de Tela</p>
                      <p className="text-xs font-medium">{formatCurrency(Number(sim.valor_tela))}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-muted-foreground">Valor Final</p>
                      <p className="text-sm font-bold text-primary">{formatCurrency(Number(sim.valor_final) || 0)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{sim.parcelas || 1}x de {formatCurrency(Number(sim.valor_parcela) || 0)}</span>
                    <span>Desc: {sim.desconto1 || 0}%+{sim.desconto2 || 0}%+{sim.desconto3 || 0}%</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
