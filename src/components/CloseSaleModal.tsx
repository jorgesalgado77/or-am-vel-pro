import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Save, Handshake } from "lucide-react";
import { maskCpfCnpj, maskPhone } from "@/lib/masks";
import { formatCurrency } from "@/lib/financing";
import { FORMAS_PAGAMENTO_LABELS } from "@/services/financialService";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

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
  valor_entrada: number;
  qtd_parcelas: number;
  valor_parcelas: number;
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
  };
  saving?: boolean;
}

const UF_OPTIONS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export function CloseSaleModal({ open, onClose, onConfirm, client, simulationData, saving }: CloseSaleModalProps) {
  const [form, setForm] = useState<CloseSaleFormData>({
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
    valor_entrada: 0,
    qtd_parcelas: 1,
    valor_parcelas: 0,
  });

  const [items, setItems] = useState<SaleItem[]>([]);
  const [itemDetails, setItemDetails] = useState<SaleItemDetail[]>([]);

  // Prefill from client and simulation data
  useEffect(() => {
    if (!open) return;
    setForm(prev => ({
      ...prev,
      nome_completo: client?.nome || "",
      cpf_cnpj: client?.cpf ? maskCpfCnpj(client.cpf) : "",
      telefone: client?.telefone1 ? maskPhone(client.telefone1) : "",
      email: client?.email || "",
      responsavel_venda: simulationData?.vendedor || client?.vendedor || "",
      numero_contrato: simulationData?.numeroOrcamento || client?.numero_orcamento || "",
      valor_entrada: simulationData?.valorEntrada || 0,
      qtd_parcelas: simulationData?.parcelas || 1,
      valor_parcelas: simulationData?.valorParcela || 0,
      data_fechamento: format(new Date(), "yyyy-MM-dd"),
    }));
  }, [open, client, simulationData]);

  const updateField = (field: keyof CloseSaleFormData, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const fetchCep = async (cep: string, prefix: "" | "_entrega") => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) return;
      setForm(prev => ({
        ...prev,
        [`endereco${prefix}`]: data.logradouro || prev[`endereco${prefix}` as keyof CloseSaleFormData],
        [`bairro${prefix}`]: data.bairro || prev[`bairro${prefix}` as keyof CloseSaleFormData],
        [`cidade${prefix}`]: data.localidade || prev[`cidade${prefix}` as keyof CloseSaleFormData],
        [`uf${prefix}`]: data.uf || prev[`uf${prefix}` as keyof CloseSaleFormData],
      } as any));
    } catch {}
  };

  const handleCepChange = (field: "cep" | "cep_entrega", value: string) => {
    const masked = value.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
    updateField(field, masked);
    if (masked.replace(/\D/g, "").length === 8) {
      fetchCep(masked, field === "cep" ? "" : "_entrega");
    }
  };

  const addItem = () => {
    const newNum = items.length + 1;
    const newItem: SaleItem = {
      id: crypto.randomUUID(),
      quantidade: 1,
      descricao_ambiente: "",
      fornecedor: "",
      prazo: "",
      valor_ambiente: 0,
    };
    setItems(prev => [...prev, newItem]);
    setItemDetails(prev => [...prev, {
      item_num: newNum,
      titulos: "", corpo: "", porta: "", puxador: "", complemento: "", modelo: "",
    }]);
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
    setItemDetails(prev => {
      const updated = prev.filter((_, i) => i !== index);
      return updated.map((d, i) => ({ ...d, item_num: i + 1 }));
    });
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
    if (!form.nome_completo.trim()) {
      toast.error("Nome completo é obrigatório");
      return;
    }
    onConfirm(form, items, itemDetails);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Handshake className="h-5 w-5 text-primary" />
            Fechar Venda — Dados do Contrato
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 pb-6">
          <div className="space-y-6 pr-2">
            {/* Dados do Contrato */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Dados do Contrato</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Nº do Contrato</Label>
                    <Input value={form.numero_contrato} onChange={e => updateField("numero_contrato", e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Data Fechamento</Label>
                    <Input type="date" value={form.data_fechamento} onChange={e => updateField("data_fechamento", e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Responsável pela Venda</Label>
                    <Input value={form.responsavel_venda} onChange={e => updateField("responsavel_venda", e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Dados Pessoais */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Dados Pessoais do Cliente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Nome Completo *</Label>
                    <Input value={form.nome_completo} onChange={e => updateField("nome_completo", e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Data de Nascimento</Label>
                    <Input type="date" value={form.data_nascimento} onChange={e => updateField("data_nascimento", e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">CPF/CNPJ</Label>
                    <Input value={form.cpf_cnpj} onChange={e => updateField("cpf_cnpj", maskCpfCnpj(e.target.value))} className="mt-1 h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">RG / Insc. Estadual</Label>
                    <Input value={form.rg_insc_estadual} onChange={e => updateField("rg_insc_estadual", e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Profissão</Label>
                    <Input value={form.profissao} onChange={e => updateField("profissao", e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Telefone</Label>
                    <Input value={form.telefone} onChange={e => updateField("telefone", maskPhone(e.target.value))} className="mt-1 h-9 text-sm" placeholder="(00) 00000-0000" />
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
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Endereço Atual</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">CEP</Label>
                    <Input value={form.cep} onChange={e => handleCepChange("cep", e.target.value)} className="mt-1 h-9 text-sm" placeholder="00000-000" />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs">Endereço</Label>
                    <Input value={form.endereco} onChange={e => updateField("endereco", e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Bairro</Label>
                    <Input value={form.bairro} onChange={e => updateField("bairro", e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Cidade</Label>
                    <Input value={form.cidade} onChange={e => updateField("cidade", e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">UF</Label>
                    <Select value={form.uf} onValueChange={v => updateField("uf", v)}>
                      <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="UF" /></SelectTrigger>
                      <SelectContent>
                        {UF_OPTIONS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Endereço de Entrega */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Endereço de Entrega</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">CEP</Label>
                    <Input value={form.cep_entrega} onChange={e => handleCepChange("cep_entrega", e.target.value)} className="mt-1 h-9 text-sm" placeholder="00000-000" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Endereço de Entrega</Label>
                    <Input value={form.endereco_entrega} onChange={e => updateField("endereco_entrega", e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Prazo de Entrega</Label>
                    <Input value={form.prazo_entrega} onChange={e => updateField("prazo_entrega", e.target.value)} className="mt-1 h-9 text-sm" placeholder="Ex: 45 dias" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Bairro</Label>
                    <Input value={form.bairro_entrega} onChange={e => updateField("bairro_entrega", e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Cidade</Label>
                    <Input value={form.cidade_entrega} onChange={e => updateField("cidade_entrega", e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">UF</Label>
                    <Select value={form.uf_entrega} onValueChange={v => updateField("uf_entrega", v)}>
                      <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="UF" /></SelectTrigger>
                      <SelectContent>
                        {UF_OPTIONS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                      </SelectContent>
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
                              <TableCell>
                                <Input type="number" min={1} value={item.quantidade} onChange={e => updateItem(idx, "quantidade", Number(e.target.value))} className="h-8 text-xs w-14" />
                              </TableCell>
                              <TableCell>
                                <Input value={item.descricao_ambiente} onChange={e => updateItem(idx, "descricao_ambiente", e.target.value)} className="h-8 text-xs" placeholder="Ex: Cozinha" />
                              </TableCell>
                              <TableCell>
                                <Input value={item.fornecedor} onChange={e => updateItem(idx, "fornecedor", e.target.value)} className="h-8 text-xs" />
                              </TableCell>
                              <TableCell>
                                <Input value={item.prazo} onChange={e => updateItem(idx, "prazo", e.target.value)} className="h-8 text-xs" />
                              </TableCell>
                              <TableCell>
                                <Input type="number" min={0} step={0.01} value={item.valor_ambiente || ""} onChange={e => updateItem(idx, "valor_ambiente", Number(e.target.value))} className="h-8 text-xs" />
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItem(idx)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
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
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Detalhes dos Itens</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 text-xs">Item</TableHead>
                          <TableHead className="text-xs">Títulos</TableHead>
                          <TableHead className="text-xs">Corpo</TableHead>
                          <TableHead className="text-xs">Porta</TableHead>
                          <TableHead className="text-xs">Puxador</TableHead>
                          <TableHead className="text-xs">Complemento</TableHead>
                          <TableHead className="text-xs">Modelo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itemDetails.map((detail, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs font-medium text-center">{detail.item_num}</TableCell>
                            <TableCell><Input value={detail.titulos} onChange={e => updateDetail(idx, "titulos", e.target.value)} className="h-8 text-xs" /></TableCell>
                            <TableCell><Input value={detail.corpo} onChange={e => updateDetail(idx, "corpo", e.target.value)} className="h-8 text-xs" /></TableCell>
                            <TableCell><Input value={detail.porta} onChange={e => updateDetail(idx, "porta", e.target.value)} className="h-8 text-xs" /></TableCell>
                            <TableCell><Input value={detail.puxador} onChange={e => updateDetail(idx, "puxador", e.target.value)} className="h-8 text-xs" /></TableCell>
                            <TableCell><Input value={detail.complemento} onChange={e => updateDetail(idx, "complemento", e.target.value)} className="h-8 text-xs" /></TableCell>
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
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Observações</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea value={form.observacoes} onChange={e => updateField("observacoes", e.target.value)} rows={3} placeholder="Observações gerais sobre o contrato..." className="text-sm" />
              </CardContent>
            </Card>

            {/* Resumo Financeiro */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Resumo Financeiro</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Valor Total do Contrato</span>
                      <span className="text-lg font-bold text-primary">{formatCurrency(simulationData?.valorFinal || totalAmbientes)}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Forma de Pagamento</Label>
                      <p className="text-sm font-medium mt-1">{formaLabel[simulationData?.formaPagamento || ""] || simulationData?.formaPagamento || "—"}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Entrada</Label>
                        <Input type="number" min={0} step={0.01} value={form.valor_entrada || ""} onChange={e => updateField("valor_entrada", Number(e.target.value))} className="mt-1 h-9 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Parcelas</Label>
                        <Input type="number" min={1} value={form.qtd_parcelas} onChange={e => updateField("qtd_parcelas", Number(e.target.value))} className="mt-1 h-9 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Valor Parcela</Label>
                        <Input type="number" min={0} step={0.01} value={form.valor_parcelas || ""} onChange={e => updateField("valor_parcelas", Number(e.target.value))} className="mt-1 h-9 text-sm" />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-3 pb-4">
              <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
              <Button onClick={handleSubmit} disabled={saving} className="flex-1 gap-2">
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar Contrato e Continuar"}
              </Button>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
