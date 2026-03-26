import {useState, useEffect, useMemo} from "react";
import {usePersistedFormState} from "@/hooks/usePersistedFormState";
import {Dialog, DialogContent, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Checkbox} from "@/components/ui/checkbox";
import {Plus, Trash2, Save, Handshake, Loader2} from "lucide-react";
import {maskCpfCnpj, maskPhone, maskCurrency, unmaskCurrency, validateCpfCnpj, maskRgIe, maskCep, isCnpj} from "@/lib/masks";
import {formatCurrency} from "@/lib/financing";
import {FORMAS_PAGAMENTO_LABELS} from "@/services/financialService";
import {toast} from "sonner";
import {format} from "date-fns";
import {supabase} from "@/lib/supabaseClient";
import {getTenantId} from "@/lib/tenantState";
import type {Database} from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

interface SaleItem {
  id: string;
  quantidade: number;
  descricao_ambiente: string;
  fornecedor: string;
  prazo: string;
  valor_ambiente: number;
}

interface SaleItemDetail {
  item_num: number;
  titulos: string;
  corpo: string;
  porta: string;
  puxador: string;
  complemento: string;
  modelo: string;
}

interface CloseSaleFormData {
  numero_contrato: string;
  data_fechamento: string;
  responsavel_venda: string;
  nome_completo: string;
  data_nascimento: string;
  cpf_cnpj: string;
  rg_insc_estadual: string;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  profissao: string;
  telefone: string;
  email: string;
  endereco_entrega: string;
  prazo_entrega: string;
  bairro_entrega: string;
  cidade_entrega: string;
  uf_entrega: string;
  cep_entrega: string;
  observacoes: string;
  valor_entrada: string;
  qtd_parcelas: number;
  valor_parcelas: string;
}

interface CloseSaleModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: CloseSaleFormData, items: SaleItem[], itemDetails: SaleItemDetail[]) => void;
  client?: Client | null;
  simulationData?: {
    valorFinal: number;
    valorEntrada: number;
    parcelas: number;
    valorParcela: number;
    formaPagamento: string;
    vendedor?: string;
    numeroOrcamento?: string;
    ambientes?: { nome: string; fornecedor?: string; corpo?: string; porta?: string; puxador?: string; complemento?: string; modelo?: string; valor?: number }[];
  };
  saving?: boolean;
}

const UF_OPTIONS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export function CloseSaleModal({ open, onClose, onConfirm, client, simulationData, saving }: CloseSaleModalProps) {
  const defaultForm: CloseSaleFormData = {
    numero_contrato: "",
    data_fechamento: format(new Date(), "yyyy-MM-dd"),
    responsavel_venda: "",
    nome_completo: "",
    data_nascimento: "",
    cpf_cnpj: "",
    rg_insc_estadual: "",
    endereco: "",
    bairro: "",
    cidade: "",
    uf: "",
    cep: "",
    profissao: "",
    telefone: "",
    email: "",
    endereco_entrega: "",
    prazo_entrega: "",
    bairro_entrega: "",
    cidade_entrega: "",
    uf_entrega: "",
    cep_entrega: "",
    observacoes: "",
    valor_entrada: "",
    qtd_parcelas: 1,
    valor_parcelas: "",
  };

  const [form, updateForm, clearForm] = usePersistedFormState<CloseSaleFormData>("close-sale-form", defaultForm);

  const [items, setItems] = useState<SaleItem[]>([]);
  const [itemDetails, setItemDetails] = useState<SaleItemDetail[]>([]);
  const [cepLoading, setCepLoading] = useState<"" | "_entrega" | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());
  const [cpfCnpjError, setCpfCnpjError] = useState<string>("");
  const [sameAddress, setSameAddress] = useState(false);
  const [deliveryDeadlines, setDeliveryDeadlines] = useState<{id: string; label: string; dias: number}[]>([]);
  const [fornecedores, setFornecedores] = useState<{id: string; nome: string}[]>([]);

  const REQUIRED_FIELDS: { key: keyof CloseSaleFormData; label: string }[] = [
    { key: "nome_completo", label: "Nome Completo" },
    { key: "cpf_cnpj", label: "CPF/CNPJ" },
    { key: "telefone", label: "Telefone" },
    { key: "endereco", label: "Endereço" },
    { key: "cidade", label: "Cidade" },
    { key: "uf", label: "UF" },
    { key: "cep", label: "CEP" },
    { key: "data_fechamento", label: "Data Fechamento" },
    { key: "responsavel_venda", label: "Responsável pela Venda" },
  ];

  const errorClass = (field: keyof CloseSaleFormData) =>
    fieldErrors.has(field) ? "border-destructive ring-1 ring-destructive/30" : "";

  // Detect CPF vs CNPJ for dynamic label
  const docType = isCnpj(form.cpf_cnpj) ? "CNPJ" : "CPF";
  const rgLabel = isCnpj(form.cpf_cnpj) ? "Inscrição Estadual" : "RG";

  // Load delivery deadlines and fornecedores from settings
  useEffect(() => {
    const tenantId = getTenantId();
    if (!tenantId) return;
    // Load prazos
    supabase.from("tenant_settings" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("chave", "prazos_entrega")
      .maybeSingle()
      .then(({ data }) => {
        if (data && (data as any).valor) {
          try { setDeliveryDeadlines(JSON.parse((data as any).valor)); } catch {}
        } else {
          setDeliveryDeadlines([
            { id: "1", label: "30 dias úteis", dias: 30 },
            { id: "2", label: "45 dias úteis", dias: 45 },
            { id: "3", label: "60 dias úteis", dias: 60 },
            { id: "4", label: "90 dias úteis", dias: 90 },
          ]);
        }
      });
    // Load fornecedores
    supabase.from("tenant_settings" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("chave", "fornecedores")
      .maybeSingle()
      .then(({ data }) => {
        if (data && (data as any).valor) {
          try {
            const parsed = JSON.parse((data as any).valor);
            setFornecedores(parsed.filter((f: any) => f.ativo !== false).map((f: any) => ({ id: f.id, nome: f.nome })));
          } catch {}
        }
      });
  }, [open]);

  // Prefill from client and simulation data
  useEffect(() => {
    if (!open) return;
    const prefill: Partial<CloseSaleFormData> = {
      nome_completo: client?.nome || "",
      cpf_cnpj: client?.cpf ? maskCpfCnpj(client.cpf) : "",
      rg_insc_estadual: (client as any)?.rg ? maskRgIe((client as any).rg) : "",
      profissao: (client as any)?.profissao || "",
      telefone: client?.telefone1 ? maskPhone(client.telefone1) : "",
      email: client?.email || "",
      endereco: (client as any)?.endereco || "",
      bairro: (client as any)?.bairro || "",
      cidade: (client as any)?.cidade || "",
      uf: (client as any)?.uf || "",
      cep: (client as any)?.cep ? maskCep((client as any).cep) : "",
      data_nascimento: (client as any)?.data_nascimento || "",
      responsavel_venda: simulationData?.vendedor || client?.vendedor || "",
      numero_contrato: simulationData?.numeroOrcamento || client?.numero_orcamento || "",
      valor_entrada: simulationData?.valorEntrada ? maskCurrency(String(Math.round(simulationData.valorEntrada * 100))) : "",
      qtd_parcelas: simulationData?.parcelas || 1,
      valor_parcelas: simulationData?.valorParcela ? maskCurrency(String(Math.round(simulationData.valorParcela * 100))) : "",
      data_fechamento: format(new Date(), "yyyy-MM-dd"),
    };
    const filtered = Object.fromEntries(
      Object.entries(prefill).filter(([_, v]) => v !== "" && v !== 0 && v !== undefined)
    ) as Partial<CloseSaleFormData>;
    if (Object.keys(filtered).length > 0) updateForm(filtered);

    // Load environments from simulation data
    if (simulationData?.ambientes && simulationData.ambientes.length > 0) {
      const simItems: SaleItem[] = simulationData.ambientes.map((amb, idx) => ({
        id: crypto.randomUUID(),
        quantidade: 1,
        descricao_ambiente: amb.nome || `Ambiente ${idx + 1}`,
        fornecedor: amb.fornecedor || "",
        prazo: "",
        valor_ambiente: amb.valor || 0,
      }));
      const simDetails: SaleItemDetail[] = simulationData.ambientes.map((amb, idx) => ({
        item_num: idx + 1,
        titulos: amb.nome || "",
        corpo: amb.corpo || "",
        porta: amb.porta || "",
        puxador: amb.puxador || "",
        complemento: amb.complemento || "",
        modelo: amb.modelo || "",
      }));
      setItems(simItems);
      setItemDetails(simDetails);
    }
  }, [open, client, simulationData]);

  // Same address checkbox handler
  useEffect(() => {
    if (sameAddress) {
      updateForm({
        endereco_entrega: form.endereco,
        bairro_entrega: form.bairro,
        cidade_entrega: form.cidade,
        uf_entrega: form.uf,
        cep_entrega: form.cep,
      });
    }
  }, [sameAddress, form.endereco, form.bairro, form.cidade, form.uf, form.cep]);

  const updateField = (field: keyof CloseSaleFormData, value: string | number) => {
    updateForm({ [field]: value } as Partial<CloseSaleFormData>);
    if (fieldErrors.has(field)) {
      setFieldErrors(prev => { const n = new Set(prev); n.delete(field); return n; });
    }
  };

  const fetchCep = async (cep: string, prefix: "" | "_entrega") => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(prefix);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) { toast.error("CEP não encontrado"); return; }
      updateForm({
        [`endereco${prefix}`]: data.logradouro || form[`endereco${prefix}` as keyof CloseSaleFormData],
        [`bairro${prefix}`]: data.bairro || form[`bairro${prefix}` as keyof CloseSaleFormData],
        [`cidade${prefix}`]: data.localidade || form[`cidade${prefix}` as keyof CloseSaleFormData],
        [`uf${prefix}`]: data.uf || form[`uf${prefix}` as keyof CloseSaleFormData],
      } as Partial<CloseSaleFormData>);
      toast.success("Endereço preenchido pelo CEP!");
    } catch { toast.error("Erro ao buscar CEP"); } finally { setCepLoading(null); }
  };

  const handleCepChange = (field: "cep" | "cep_entrega", value: string) => {
    const masked = maskCep(value);
    updateField(field, masked);
    if (masked.replace(/\D/g, "").length === 8) {
      fetchCep(masked, field === "cep" ? "" : "_entrega");
    }
  };

  const addItem = () => {
    const newNum = items.length + 1;
    setItems(prev => [...prev, { id: crypto.randomUUID(), quantidade: 1, descricao_ambiente: "", fornecedor: "", prazo: "", valor_ambiente: 0 }]);
    setItemDetails(prev => [...prev, { item_num: newNum, titulos: "", corpo: "", porta: "", puxador: "", complemento: "", modelo: "" }]);
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
    setItemDetails(prev => prev.filter((_, i) => i !== index).map((d, i) => ({ ...d, item_num: i + 1 })));
  };

  const updateItem = (index: number, field: keyof SaleItem, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const updateDetail = (index: number, field: keyof SaleItemDetail, value: string) => {
    setItemDetails(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d));
  };

  const totalAmbientes = useMemo(() => items.reduce((acc, item) => acc + item.valor_ambiente, 0), [items]);
  const formaLabel = FORMAS_PAGAMENTO_LABELS;

  const handleSubmit = () => {
    const errors = new Set<string>();
    for (const { key } of REQUIRED_FIELDS) {
      const val = form[key];
      if (typeof val === "string" && !val.trim()) errors.add(key);
    }
    let cpfErr = "";
    if (form.cpf_cnpj.trim()) {
      const result = validateCpfCnpj(form.cpf_cnpj);
      if (!result.valid) { cpfErr = result.message || "CPF/CNPJ inválido"; errors.add("cpf_cnpj"); }
    }
    setCpfCnpjError(cpfErr);
    setFieldErrors(errors);
    if (errors.size > 0) {
      const missing = REQUIRED_FIELDS.filter(f => errors.has(f.key)).map(f => f.label);
      toast.error(cpfErr || `Preencha: ${missing.join(", ")}`);
      return;
    }
    onConfirm(form, items, itemDetails);
    clearForm();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl w-[98vw] sm:w-auto max-h-[92vh] flex flex-col p-0">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Handshake className="h-5 w-5 text-primary" />
            Fechar Venda — Dados do Contrato
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4 sm:pb-6" style={{ maxHeight: "calc(92vh - 80px)" }}>
          <div className="space-y-4 sm:space-y-6">
            {/* Dados do Contrato */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Dados do Contrato</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Nº do Contrato</Label>
                    <Input value={form.numero_contrato} onChange={e => updateField("numero_contrato", e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Data Fechamento *</Label>
                    <Input type="date" value={form.data_fechamento} onChange={e => updateField("data_fechamento", e.target.value)} className={`mt-1 h-9 text-sm ${errorClass("data_fechamento")}`} />
                  </div>
                  <div>
                    <Label className="text-xs">Responsável pela Venda *</Label>
                    <Input value={form.responsavel_venda} onChange={e => updateField("responsavel_venda", e.target.value)} className={`mt-1 h-9 text-sm ${errorClass("responsavel_venda")}`} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Dados Pessoais */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Dados Pessoais do Cliente</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Nome Completo *</Label>
                    <Input value={form.nome_completo} onChange={e => updateField("nome_completo", e.target.value)} className={`mt-1 h-9 text-sm ${errorClass("nome_completo")}`} />
                  </div>
                  <div>
                    <Label className="text-xs">Data de Nascimento</Label>
                    <Input type="date" value={form.data_nascimento} onChange={e => updateField("data_nascimento", e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">{docType} *</Label>
                    <Input
                      value={form.cpf_cnpj}
                      onChange={e => { updateField("cpf_cnpj", maskCpfCnpj(e.target.value)); setCpfCnpjError(""); }}
                      className={`mt-1 h-9 text-sm ${errorClass("cpf_cnpj")}`}
                      placeholder={docType === "CNPJ" ? "00.000.000/0000-00" : "000.000.000-00"}
                    />
                    {cpfCnpjError && <p className="text-xs text-destructive mt-1">{cpfCnpjError}</p>}
                  </div>
                  <div>
                    <Label className="text-xs">{rgLabel}</Label>
                    <Input
                      value={form.rg_insc_estadual}
                      onChange={e => updateField("rg_insc_estadual", maskRgIe(e.target.value))}
                      className="mt-1 h-9 text-sm"
                      placeholder={isCnpj(form.cpf_cnpj) ? "Inscrição Estadual" : "00.000.000-0"}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Profissão</Label>
                    <Input value={form.profissao} onChange={e => updateField("profissao", e.target.value.toUpperCase())} className="mt-1 h-9 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Telefone *</Label>
                    <Input value={form.telefone} onChange={e => updateField("telefone", maskPhone(e.target.value))} className={`mt-1 h-9 text-sm ${errorClass("telefone")}`} placeholder="(00) 00000-0000" />
                  </div>
                  <div>
                    <Label className="text-xs">Email</Label>
                    <Input type="email" value={form.email} onChange={e => updateField("email", e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Endereço Atual */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Endereço Atual</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">CEP *</Label>
                    <div className="relative">
                      <Input value={form.cep} onChange={e => handleCepChange("cep", e.target.value)} className={`mt-1 h-9 text-sm pr-8 ${errorClass("cep")}`} placeholder="00000-000" />
                      {cepLoading === "" && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 mt-0.5 h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                  </div>
                  <div className="sm:col-span-3">
                    <Label className="text-xs">Endereço *</Label>
                    <Input value={form.endereco} onChange={e => updateField("endereco", e.target.value)} className={`mt-1 h-9 text-sm ${errorClass("endereco")}`} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Bairro</Label>
                    <Input value={form.bairro} onChange={e => updateField("bairro", e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Cidade *</Label>
                    <Input value={form.cidade} onChange={e => updateField("cidade", e.target.value)} className={`mt-1 h-9 text-sm ${errorClass("cidade")}`} />
                  </div>
                  <div>
                    <Label className="text-xs">UF *</Label>
                    <Select value={form.uf} onValueChange={v => updateField("uf", v)}>
                      <SelectTrigger className={`mt-1 h-9 text-sm ${errorClass("uf")}`}><SelectValue placeholder="UF" /></SelectTrigger>
                      <SelectContent>{UF_OPTIONS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Endereço de Entrega */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Endereço de Entrega</CardTitle>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="same-address"
                      checked={sameAddress}
                      onCheckedChange={(checked) => setSameAddress(!!checked)}
                    />
                    <label htmlFor="same-address" className="text-xs text-muted-foreground cursor-pointer">
                      Mesmo endereço atual
                    </label>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">CEP</Label>
                    <div className="relative">
                      <Input value={form.cep_entrega} onChange={e => handleCepChange("cep_entrega", e.target.value)} className="mt-1 h-9 text-sm pr-8" placeholder="00000-000" disabled={sameAddress} />
                      {cepLoading === "_entrega" && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 mt-0.5 h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Endereço de Entrega</Label>
                    <Input value={form.endereco_entrega} onChange={e => updateField("endereco_entrega", e.target.value)} className="mt-1 h-9 text-sm" disabled={sameAddress} />
                  </div>
                  <div>
                    <Label className="text-xs">Prazo de Entrega</Label>
                    {deliveryDeadlines.length > 0 ? (
                      <Select value={form.prazo_entrega} onValueChange={v => updateField("prazo_entrega", v)}>
                        <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {deliveryDeadlines.map(d => (
                            <SelectItem key={d.id} value={d.label}>{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={form.prazo_entrega} onChange={e => updateField("prazo_entrega", e.target.value)} className="mt-1 h-9 text-sm" placeholder="Ex: 45 dias" />
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Bairro</Label>
                    <Input value={form.bairro_entrega} onChange={e => updateField("bairro_entrega", e.target.value)} className="mt-1 h-9 text-sm" disabled={sameAddress} />
                  </div>
                  <div>
                    <Label className="text-xs">Cidade</Label>
                    <Input value={form.cidade_entrega} onChange={e => updateField("cidade_entrega", e.target.value)} className="mt-1 h-9 text-sm" disabled={sameAddress} />
                  </div>
                  <div>
                    <Label className="text-xs">UF</Label>
                    <Select value={form.uf_entrega} onValueChange={v => updateField("uf_entrega", v)} disabled={sameAddress}>
                      <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="UF" /></SelectTrigger>
                      <SelectContent>{UF_OPTIONS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Itens / Ambientes */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Itens / Ambientes</CardTitle>
                  <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={addItem}>
                    <Plus className="h-3.5 w-3.5" /> Novo Item
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Clique em "Novo Item" para adicionar ambientes</p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12 text-xs">Item</TableHead>
                            <TableHead className="w-16 text-xs">Qtd</TableHead>
                            <TableHead className="text-xs">Descrição / Ambiente</TableHead>
                            <TableHead className="text-xs">Fornecedor</TableHead>
                            <TableHead className="w-24 text-xs">Prazo</TableHead>
                            <TableHead className="w-32 text-xs">Valor Ambiente</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((item, idx) => (
                            <TableRow key={item.id}>
                              <TableCell className="text-xs font-medium text-center">{idx + 1}</TableCell>
                              <TableCell><Input type="number" min={1} value={item.quantidade} onChange={e => updateItem(idx, "quantidade", Number(e.target.value))} className="h-8 text-xs w-14" /></TableCell>
                              <TableCell><Input value={item.descricao_ambiente} onChange={e => updateItem(idx, "descricao_ambiente", e.target.value)} className="h-8 text-xs" placeholder="Ex: Cozinha" /></TableCell>
                              <TableCell>
                                {fornecedores.length > 0 ? (
                                  <Select value={item.fornecedor} onValueChange={v => updateItem(idx, "fornecedor", v)}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                    <SelectContent>
                                      {fornecedores.map(f => (
                                        <SelectItem key={f.id} value={f.nome}>{f.nome}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input value={item.fornecedor} onChange={e => updateItem(idx, "fornecedor", e.target.value)} className="h-8 text-xs" />
                                )}
                              </TableCell>
                              <TableCell>
                                {deliveryDeadlines.length > 0 ? (
                                  <Select value={item.prazo} onValueChange={v => updateItem(idx, "prazo", v)}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Prazo..." /></SelectTrigger>
                                    <SelectContent>
                                      {deliveryDeadlines.map(d => (
                                        <SelectItem key={d.id} value={d.label}>{d.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input value={item.prazo} onChange={e => updateItem(idx, "prazo", e.target.value)} className="h-8 text-xs" />
                                )}
                              </TableCell>
                              <TableCell><Input value={item.valor_ambiente ? maskCurrency(String(Math.round(item.valor_ambiente * 100))) : ""} onChange={e => updateItem(idx, "valor_ambiente", unmaskCurrency(e.target.value))} className="h-8 text-xs" placeholder="R$ 0,00" /></TableCell>
                              <TableCell><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItem(idx)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex justify-end mt-3">
                      <div className="bg-primary/5 rounded-md px-4 py-2">
                        <span className="text-xs text-muted-foreground mr-2">Total Ambientes:</span>
                        <span className="text-sm font-bold text-primary">{formatCurrency(totalAmbientes)}</span>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Detalhes dos Itens */}
            {items.length > 0 && (
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Detalhes dos Ambientes</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 text-xs">Item</TableHead>
                          <TableHead className="text-xs">Ambiente</TableHead>
                          <TableHead className="text-xs">Corpo (esp./cor)</TableHead>
                          <TableHead className="text-xs">Porta (esp./cor)</TableHead>
                          <TableHead className="text-xs">Puxador</TableHead>
                          <TableHead className="text-xs">Complemento</TableHead>
                          <TableHead className="text-xs">Modelo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itemDetails.map((detail, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs font-medium text-center">{detail.item_num}</TableCell>
                            <TableCell><Input value={detail.titulos} onChange={e => updateDetail(idx, "titulos", e.target.value)} className="h-8 text-xs" placeholder={items[idx]?.descricao_ambiente || ""} /></TableCell>
                            <TableCell><Input value={detail.corpo} onChange={e => updateDetail(idx, "corpo", e.target.value)} className="h-8 text-xs" placeholder="15mm BRANCO" /></TableCell>
                            <TableCell><Input value={detail.porta} onChange={e => updateDetail(idx, "porta", e.target.value)} className="h-8 text-xs" placeholder="18mm Preto" /></TableCell>
                            <TableCell><Input value={detail.puxador} onChange={e => updateDetail(idx, "puxador", e.target.value)} className="h-8 text-xs" /></TableCell>
                            <TableCell><Input value={detail.complemento} onChange={e => updateDetail(idx, "complemento", e.target.value)} className="h-8 text-xs" placeholder="Dobradiças, corrediças" /></TableCell>
                            <TableCell><Input value={detail.modelo} onChange={e => updateDetail(idx, "modelo", e.target.value)} className="h-8 text-xs" /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Observações */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Observações</CardTitle></CardHeader>
              <CardContent>
                <Textarea value={form.observacoes} onChange={e => updateField("observacoes", e.target.value)} rows={3} placeholder="Observações gerais sobre o contrato..." className="text-sm" />
              </CardContent>
            </Card>

            {/* Resumo Financeiro */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Resumo Financeiro</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Ambientes</span>
                      <span className="text-sm font-medium">{formatCurrency(totalAmbientes)}</span>
                    </div>
                    <div className="flex justify-between items-center border-t pt-2">
                      <span className="text-sm font-medium">Valor Total do Contrato</span>
                      <span className="text-lg font-bold text-primary">{formatCurrency(simulationData?.valorFinal || totalAmbientes)}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Forma de Pagamento</Label>
                      <p className="text-sm font-medium mt-1">{formaLabel[simulationData?.formaPagamento || ""] || simulationData?.formaPagamento || "—"}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Entrada</Label>
                        <Input value={form.valor_entrada} onChange={e => updateField("valor_entrada", maskCurrency(e.target.value))} className="mt-1 h-9 text-sm" placeholder="R$ 0,00" />
                      </div>
                      <div>
                        <Label className="text-xs">Parcelas</Label>
                        <Input type="number" min={1} value={form.qtd_parcelas} onChange={e => updateField("qtd_parcelas", Number(e.target.value))} className="mt-1 h-9 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Valor Parcela</Label>
                        <Input value={form.valor_parcelas} onChange={e => updateField("valor_parcelas", maskCurrency(e.target.value))} className="mt-1 h-9 text-sm" placeholder="R$ 0,00" />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pb-4">
              <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
              <Button onClick={handleSubmit} disabled={saving} className="flex-1 gap-2">
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar Contrato e Continuar"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
