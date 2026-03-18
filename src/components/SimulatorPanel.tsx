import { useState, useMemo, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FileDown, Lock, LockOpen, Upload, Save, UserPlus, FileText, X, Handshake } from "lucide-react";
import { maskCpfCnpj, maskPhone, isCnpj, validateCpfCnpj } from "@/lib/masks";
import { calculateSimulation, formatCurrency, formatPercent, type FormaPagamento, type SimulationInput, type BoletoRateData } from "@/lib/financing";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { generateSimulationPdf } from "@/lib/generatePdf";
import { ContractEditorDialog } from "@/components/ContractEditorDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useFinancingRates } from "@/hooks/useFinancingRates";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useDiscountOptions } from "@/hooks/useDiscountOptions";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useIndicadores } from "@/hooks/useIndicadores";
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
  onClientCreated?: () => void;
}

export function SimulatorPanel({ client, onBack, onClientCreated }: SimulatorPanelProps) {
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

  // Imported file state
  const [importedFile, setImportedFile] = useState<File | null>(null);
  const [selectedIndicadorId, setSelectedIndicadorId] = useState("");

  // New client form state (when no client is provided)
  const [showClientForm, setShowClientForm] = useState(false);
  const [newClient, setNewClient] = useState({
    nome: "", cpf: "", telefone1: "", telefone2: "", email: "",
    vendedor: "", quantidade_ambientes: 0, descricao_ambientes: "", indicador_id: "",
  });

  const { settings } = useCompanySettings();
  const { hasPermission } = useCurrentUser();
  const { getOptionsForField } = useDiscountOptions();
  const { projetistas } = useUsuarios();
  const { activeIndicadores } = useIndicadores();

  // Get the selected indicador's commission
  const selectedIndicador = activeIndicadores.find(i => i.id === selectedIndicadorId);
  const comissaoPercentual = selectedIndicador ? selectedIndicador.comissao_percentual : 0;
  const valorTelaComComissao = valorTela * (1 + comissaoPercentual / 100);

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
      valorTela: valorTelaComComissao, desconto1, desconto2, desconto3,
      formaPagamento, parcelas, valorEntrada, plusPercentual,
      creditRates: creditoCoeffMap,
      boletoRates: boletoCoeffMap,
      boletoRatesFull: boletoRatesFullMap,
      carenciaDias,
    };
    return calculateSimulation(input);
  }, [valorTelaComComissao, desconto1, desconto2, desconto3, formaPagamento, parcelas, valorEntrada, plusPercentual, selectedBoletoProvider, selectedCreditoProvider, boletoRates, creditoRates, carenciaDias]);

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

  const handleFileImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.xml";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setImportedFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        if (!content) return;
        let total: number | null = null;

        if (file.name.toLowerCase().endsWith(".xml")) {
          const match = content.match(/<(?:Total|ValorTotal|TOTAL|valor_total)[^>]*>\s*([\d.,]+)\s*</i);
          if (match) total = parseFloat(match[1].replace(/\./g, "").replace(",", "."));
        } else {
          const match = content.match(/Total\s*=\s*([\d.,]+)/i);
          if (match) total = parseFloat(match[1].replace(",", "."));
        }

        if (total && !isNaN(total)) {
          setValorTela(total);
          toast.success(`Valor de tela importado: ${formatCurrency(total)}`);
        } else {
          toast.error("Não foi possível encontrar o valor total no arquivo");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const uploadFile = async (file: File, clientId: string): Promise<{ url: string; nome: string } | null> => {
    const ext = file.name.split(".").pop() || "txt";
    const path = `projetos/${clientId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("company-assets").upload(path, file);
    if (error) { console.error("Upload error:", error); return null; }
    const { data: urlData } = supabase.storage.from("company-assets").getPublicUrl(path);
    return { url: urlData.publicUrl, nome: file.name };
  };

  const handleSave = async () => {
    let clientId = client?.id;

    // If no client, create one first
    if (!clientId) {
      if (!showClientForm) {
        setShowClientForm(true);
        return;
      }
      if (!newClient.nome.trim()) {
        toast.error("Nome do cliente é obrigatório");
        return;
      }
      setSaving(true);

      // Generate orçamento number
      const { data: maxData } = await supabase.from("clients").select("numero_orcamento_seq").order("numero_orcamento_seq", { ascending: false }).limit(1).single() as any;
      let nextSeq: number;
      if (!maxData?.numero_orcamento_seq) {
        const { data: settingsData } = await supabase.from("company_settings").select("orcamento_numero_inicial").limit(1).single() as any;
        nextSeq = settingsData?.orcamento_numero_inicial || 1;
      } else {
        nextSeq = (maxData.numero_orcamento_seq as number) + 1;
      }
      const padded = String(nextSeq).padStart(9, "0");
      const numeroOrcamento = `${padded.slice(0, 3)}.${padded.slice(3, 6)}.${padded.slice(6, 9)}`;

      const { data: created, error: clientError } = await supabase
        .from("clients")
        .insert({
          nome: newClient.nome.trim(),
          cpf: newClient.cpf || null,
          telefone1: newClient.telefone1 || null,
          telefone2: newClient.telefone2 || null,
          email: newClient.email || null,
          vendedor: newClient.vendedor || null,
          quantidade_ambientes: newClient.quantidade_ambientes || 0,
          descricao_ambientes: newClient.descricao_ambientes || null,
          indicador_id: newClient.indicador_id || null,
          numero_orcamento: numeroOrcamento,
          numero_orcamento_seq: nextSeq,
        } as any)
        .select("id")
        .single();

      if (clientError || !created) {
        toast.error("Erro ao cadastrar cliente");
        setSaving(false);
        return;
      }
      clientId = created.id;
      onClientCreated?.();
    } else {
      setSaving(true);
    }

    // Upload file if exists
    let arquivoUrl: string | null = null;
    let arquivoNome: string | null = null;
    if (importedFile) {
      const uploaded = await uploadFile(importedFile, clientId);
      if (uploaded) {
        arquivoUrl = uploaded.url;
        arquivoNome = uploaded.nome;
      }
    }

    const { error } = await supabase.from("simulations").insert({
      client_id: clientId,
      valor_tela: valorTela,
      desconto1, desconto2, desconto3,
      forma_pagamento: formaPagamento,
      parcelas,
      valor_entrada: valorEntrada,
      plus_percentual: plusPercentual,
      valor_final: result.valorFinal,
      valor_parcela: result.valorParcela,
      arquivo_url: arquivoUrl,
      arquivo_nome: arquivoNome,
    } as any);
    setSaving(false);
    if (error) toast.error("Erro ao salvar simulação");
    else {
      toast.success("Simulação salva com sucesso!");
      if (!client) {
        setShowClientForm(false);
        setNewClient({ nome: "", cpf: "", telefone1: "", telefone2: "", email: "", vendedor: "", quantidade_ambientes: 0, descricao_ambientes: "", indicador_id: "" });
      }
    }
  };

  const [closingSale, setClosingSale] = useState(false);
  const [contractEditorOpen, setContractEditorOpen] = useState(false);
  const [contractHtml, setContractHtml] = useState("");
  const [pendingSimId, setPendingSimId] = useState<string | null>(null);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);

  const handleCloseSale = async () => {
    if (!client) {
      toast.error("Selecione um cliente para fechar a venda");
      return;
    }

    setClosingSale(true);
    try {
      // First save the simulation
      let arquivoUrl: string | null = null;
      let arquivoNome: string | null = null;
      if (importedFile) {
        const uploaded = await uploadFile(importedFile, client.id);
        if (uploaded) { arquivoUrl = uploaded.url; arquivoNome = uploaded.nome; }
      }

      const { data: simData, error: simError } = await supabase.from("simulations").insert({
        client_id: client.id, valor_tela: valorTela, desconto1, desconto2, desconto3,
        forma_pagamento: formaPagamento, parcelas, valor_entrada: valorEntrada,
        plus_percentual: plusPercentual, valor_final: result.valorFinal,
        valor_parcela: result.valorParcela, arquivo_url: arquivoUrl, arquivo_nome: arquivoNome,
      } as any).select("id").single();

      if (simError || !simData) { toast.error("Erro ao salvar simulação"); setClosingSale(false); return; }

      // Fetch active contract template
      const { data: template } = await supabase
        .from("contract_templates")
        .select("*")
        .eq("ativo", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!template) {
        toast.error("Nenhum modelo de contrato ativo encontrado. Cadastre um em Configurações > Contratos.");
        setClosingSale(false);
        return;
      }

      // Fill template variables
      const dataAtual = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
      const formaLabel: Record<string, string> = {
        "A vista": "À Vista", Pix: "Pix", Credito: "Cartão de Crédito",
        Boleto: "Boleto", "Credito / Boleto": "Crédito + Boleto", "Entrada e Entrega": "Entrada e Entrega",
      };

      let html = (template as any).conteudo_html as string;
      const replacements: Record<string, string> = {
        "{{nome_cliente}}": client.nome || "",
        "{{cpf_cliente}}": client.cpf || "",
        "{{telefone_cliente}}": client.telefone1 || "",
        "{{email_cliente}}": client.email || "",
        "{{numero_orcamento}}": client.numero_orcamento || "",
        "{{projetista}}": client.vendedor || "",
        "{{valor_tela}}": formatCurrency(valorTela),
        "{{valor_final}}": formatCurrency(result.valorFinal),
        "{{forma_pagamento}}": formaLabel[formaPagamento] || formaPagamento,
        "{{parcelas}}": String(parcelas),
        "{{valor_parcela}}": formatCurrency(result.valorParcela),
        "{{valor_entrada}}": formatCurrency(valorEntrada),
        "{{data_atual}}": dataAtual,
        "{{empresa_nome}}": settings.company_name || "INOVAMAD",
        "{{indicador_nome}}": selectedIndicador?.nome || "",
        "{{indicador_comissao}}": String(comissaoPercentual),
      };

      Object.entries(replacements).forEach(([key, val]) => {
        html = html.split(key).join(val);
      });

      // Open editor dialog for review/edit before saving
      setPendingSimId(simData.id);
      setPendingTemplateId((template as any).id);
      setContractHtml(html);
      setContractEditorOpen(true);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao fechar venda");
    }
    setClosingSale(false);
  };

  const handleContractConfirm = async (finalHtml: string) => {
    if (!client || !pendingSimId) return;
    setClosingSale(true);

    const { error: contractError } = await supabase.from("client_contracts").insert({
      client_id: client.id,
      simulation_id: pendingSimId,
      template_id: pendingTemplateId,
      conteudo_html: finalHtml,
    } as any);

    if (contractError) { toast.error("Erro ao salvar contrato"); setClosingSale(false); return; }

    // Print
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Contrato - ${client.nome}</title>
        <style>body{font-family:'Segoe UI',sans-serif;padding:40px;color:#1e293b;}
        @media print{@page{margin:15mm;size:A4;}}</style></head>
        <body>${finalHtml}</body></html>`;
      printWindow.document.write(fullHtml);
      printWindow.document.close();
      printWindow.onload = () => setTimeout(() => printWindow.print(), 300);
    }

    toast.success("Venda fechada! Contrato gerado e salvo.");
    setContractEditorOpen(false);
    setPendingSimId(null);
    setPendingTemplateId(null);
    setClosingSale(false);
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
              <div className="flex gap-2 mt-1">
                <Input type="number" value={valorTela} onChange={(e) => setValorTela(Number(e.target.value))} min={0} step={100} className="flex-1" />
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  title="Importar arquivo TXT ou XML"
                  onClick={handleFileImport}
                >
                  <Upload className="h-4 w-4" />
                </Button>
              </div>
              {importedFile && (
                <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                  <FileText className="h-3 w-3 shrink-0" />
                  <span className="truncate flex-1">{importedFile.name}</span>
                  <Button variant="ghost" size="icon" className="h-4 w-4 p-0" onClick={() => setImportedFile(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            <div>
              <Label>Indicador do Cliente</Label>
              <Select value={selectedIndicadorId || "_none"} onValueChange={(v) => setSelectedIndicadorId(v === "_none" ? "" : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Nenhum (0%)</SelectItem>
                  {activeIndicadores.map((ind) => (
                    <SelectItem key={ind.id} value={ind.id}>
                      {ind.nome} ({ind.comissao_percentual}%)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {comissaoPercentual > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Acréscimo de {comissaoPercentual}%: {formatCurrency(valorTela)} → {formatCurrency(valorTelaComComissao)}
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 items-end">
              <div>
                <Label className="mb-1 block">Desconto 1 (%)</Label>
                <Select value={String(desconto1)} onValueChange={(v) => setDesconto1(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {getOptionsForField("desconto1").map((v) => (
                      <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block">Desconto 2 (%)</Label>
                <Select value={String(desconto2)} onValueChange={(v) => setDesconto2(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {getOptionsForField("desconto2").map((v) => (
                      <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 flex items-center gap-1">
                  Desconto 3 (%)
                  {!desconto3Unlocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                  {desconto3Unlocked && <LockOpen className="h-3 w-3 text-success" />}
                </Label>
                {desconto3Unlocked ? (
                  <Select value={String(desconto3)} onValueChange={(v) => setDesconto3(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {getOptionsForField("desconto3").map((v) => (
                        <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Button variant="outline" size="sm" className="w-full h-9 gap-1 text-muted-foreground" onClick={() => requestUnlock("desconto3")}>
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
                  <Select value={String(plusPercentual)} onValueChange={(v) => setPlusPercentual(Number(v))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {getOptionsForField("plus").map((v) => (
                        <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Button variant="outline" size="sm" className="mt-1 w-full gap-1 text-muted-foreground" onClick={() => requestUnlock("plus")}>
                    <Lock className="h-3 w-3" />Desbloquear
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-4"><CardTitle className="text-base">Resultado</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <ResultRow label="Valor de Tela" value={formatCurrency(valorTela)} />
              {comissaoPercentual > 0 && (
                <ResultRow label={`Indicador (${comissaoPercentual}%)`} value={`+ ${formatCurrency(valorTelaComComissao - valorTela)}`} muted />
              )}
              {comissaoPercentual > 0 && (
                <ResultRow label="Valor com Indicador" value={formatCurrency(valorTelaComComissao)} />
              )}
              <ResultRow label="Desconto Total" value={formatCurrency(valorTelaComComissao - result.valorComDesconto)} muted />
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

              <div className="flex flex-col gap-3 mt-4">
                <div className="flex gap-3">
                  <Button onClick={handleSave} disabled={saving} className="flex-1 bg-success hover:bg-success/90 text-success-foreground gap-2">
                    <Save className="h-4 w-4" />
                    {saving ? "Salvando..." : "Salvar Simulação"}
                  </Button>
                  {client && (
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
                  )}
                </div>
                {client && (
                  <Button
                    onClick={handleCloseSale}
                    disabled={closingSale}
                    className="w-full gap-2 bg-primary hover:bg-primary/90"
                  >
                    <Handshake className="h-4 w-4" />
                    {closingSale ? "Gerando contrato..." : "Fechar Venda"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Client creation form - shown when saving without a client */}
          {!client && showClientForm && (
            <Card className="border-primary/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Cadastrar Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Nome *</Label>
                  <Input value={newClient.nome} onChange={(e) => setNewClient(p => ({ ...p, nome: e.target.value }))} className="mt-1" placeholder="Nome completo" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{isCnpj(newClient.cpf) ? "CNPJ" : "CPF"}</Label>
                    <Input
                      value={newClient.cpf}
                      onChange={(e) => setNewClient(p => ({ ...p, cpf: maskCpfCnpj(e.target.value) }))}
                      className="mt-1"
                      placeholder={isCnpj(newClient.cpf) ? "00.000.000/0000-00" : "000.000.000-00"}
                    />
                    {newClient.cpf && !validateCpfCnpj(newClient.cpf).valid && (
                      <p className="text-xs text-destructive mt-1">{validateCpfCnpj(newClient.cpf).message}</p>
                    )}
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={newClient.email} onChange={(e) => setNewClient(p => ({ ...p, email: e.target.value }))} className="mt-1" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Telefone 1</Label>
                    <Input
                      value={newClient.telefone1}
                      onChange={(e) => setNewClient(p => ({ ...p, telefone1: maskPhone(e.target.value) }))}
                      className="mt-1"
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div>
                    <Label>Telefone 2</Label>
                    <Input
                      value={newClient.telefone2}
                      onChange={(e) => setNewClient(p => ({ ...p, telefone2: maskPhone(e.target.value) }))}
                      className="mt-1"
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </div>
                <div>
                  <Label>Projetista Responsável</Label>
                  <Select value={newClient.vendedor} onValueChange={(v) => setNewClient(p => ({ ...p, vendedor: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {projetistas.map((u) => (
                        <SelectItem key={u.id} value={u.apelido || u.nome_completo}>
                          {u.apelido || u.nome_completo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Indicador do Cliente</Label>
                  <Select value={newClient.indicador_id || "_none"} onValueChange={(v) => setNewClient(p => ({ ...p, indicador_id: v === "_none" ? "" : v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Nenhum</SelectItem>
                      {activeIndicadores.map((ind) => (
                        <SelectItem key={ind.id} value={ind.id}>
                          {ind.nome} ({ind.comissao_percentual}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Qtd. Ambientes</Label>
                    <Input type="number" min={0} value={newClient.quantidade_ambientes} onChange={(e) => setNewClient(p => ({ ...p, quantidade_ambientes: Number(e.target.value) }))} className="mt-1" />
                  </div>
                  <div>
                    <Label>Descrição</Label>
                    <Input value={newClient.descricao_ambientes} onChange={(e) => setNewClient(p => ({ ...p, descricao_ambientes: e.target.value }))} className="mt-1" placeholder="Ex: Cozinha, Quarto..." />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowClientForm(false)}>Cancelar</Button>
                  <Button size="sm" className="flex-1 bg-success hover:bg-success/90 text-success-foreground gap-1" onClick={handleSave} disabled={saving}>
                    <Save className="h-3 w-3" />
                    {saving ? "Salvando..." : "Cadastrar e Salvar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
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

      {client && (
        <ContractEditorDialog
          open={contractEditorOpen}
          onClose={() => { setContractEditorOpen(false); setPendingSimId(null); setPendingTemplateId(null); }}
          initialHtml={contractHtml}
          clientName={client.nome}
          onConfirm={handleContractConfirm}
          saving={closingSale}
        />
      )}
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
