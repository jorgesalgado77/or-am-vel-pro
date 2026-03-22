import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, Pencil, X, ChevronDown, ChevronRight, TrendingUp, DollarSign, Landmark } from "lucide-react";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { useCargos, type CargoPermissoes } from "@/hooks/useCargos";
import { useComissaoPolicy } from "@/hooks/useComissaoPolicy";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { getTenantId } from "@/lib/tenantState";

const PERM_LABELS_CORE: Record<string, string> = {
  clientes: "Clientes",
  simulador: "Negociação",
  configuracoes: "Configurações",
  desconto1: "Desconto 1",
  desconto2: "Desconto 2",
  desconto3: "Desconto 3",
  plus: "Plus",
};

const PERM_LABELS_MENU: Record<string, string> = {
  folha_pagamento: "Folha de Pagamento",
  financeiro: "Financeiro",
  planos: "Planos de Assinatura",
  funil: "Funil de Captação",
  campanhas: "Campanhas",
  indicacoes: "Indicações",
  vendazap: "VendaZap AI",
  chat_vendas: "Chat Vendas",
  dealroom: "Deal Room",
  divulgue_ganhe: "Divulgue e Ganhe",
  mensagens: "Mensagens",
  suporte: "Suporte",
};

const PERM_LABELS: Record<keyof CargoPermissoes, string> = {
  ...PERM_LABELS_CORE,
  ...PERM_LABELS_MENU,
} as Record<keyof CargoPermissoes, string>;

export function CargosTab() {
  const { cargos, refresh, DEFAULT_PERMISSOES } = useCargos();
  const { policy, refresh: refreshPolicy, settingsId } = useComissaoPolicy();
  const { settings } = useCompanySettings();
  const [newName, setNewName] = useState("");
  const [editPerms, setEditPerms] = useState<Record<string, CargoPermissoes>>({});
  const [editingName, setEditingName] = useState<Record<string, string>>({});
  const [editComissao, setEditComissao] = useState<Record<string, number>>({});
  const [editTipoComissao, setEditTipoComissao] = useState<Record<string, string>>({});
  const [editSalario, setEditSalario] = useState<Record<string, string>>({});
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const tenantId = getTenantId();
    if (!tenantId) { toast.error("Sessão inválida, faça login novamente"); return; }
    const { error } = await supabase.from("cargos").insert({ nome: newName.trim(), permissoes: DEFAULT_PERMISSOES as any, tenant_id: tenantId });
    if (error) { toast.error("Erro ao adicionar cargo: " + error.message); console.error(error); }
    else { toast.success("Cargo adicionado!"); setNewName(""); refresh(); }
  };

  const handleDelete = async (id: string, nome: string) => {
    if (!confirm(`Excluir cargo "${nome}"?`)) return;
    const { error } = await supabase.from("cargos").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else { toast.success("Excluído!"); refresh(); }
  };

  const togglePerm = (cargoId: string, current: CargoPermissoes, key: keyof CargoPermissoes) => {
    const existing = editPerms[cargoId] || { ...current };
    setEditPerms(prev => ({ ...prev, [cargoId]: { ...existing, [key]: !existing[key] } }));
  };

  const hasChanges = (cargoId: string) => editPerms[cargoId] || editingName[cargoId] !== undefined || editComissao[cargoId] !== undefined || editTipoComissao[cargoId] !== undefined || editSalario[cargoId] !== undefined;

  const getCargoTipoComissao = (cargoId: string): "fixa" | "escalonada" | "clt" | "clt_only" | "clt_escalonada" | "mei" | "mei_only" => {
    if (editTipoComissao[cargoId] !== undefined) return editTipoComissao[cargoId] as any;
    const cargo = cargos.find(c => c.id === cargoId);
    const tc = (cargo as any)?.tipo_comissao;
    if (tc && ["clt", "clt_only", "clt_escalonada", "mei", "mei_only"].includes(tc)) return tc;
    if (policy.cargos_ids.includes(cargoId)) return "escalonada";
    return "fixa";
  };

  const handleSave = async (cargoId: string) => {
    const perms = editPerms[cargoId];
    const newNome = editingName[cargoId];
    const newComissao = editComissao[cargoId];
    const newTipo = editTipoComissao[cargoId];
    const updates: any = {};
    if (perms) updates.permissoes = perms;
    if (newNome !== undefined) updates.nome = newNome.trim();
    if (newComissao !== undefined) updates.comissao_percentual = newComissao;
    if (newTipo !== undefined) updates.tipo_comissao = newTipo;
    const newSalario = editSalario[cargoId];
    if (newSalario !== undefined) updates.salario_base = Math.round(unmaskCurrency(newSalario));
    // Save commission type: update cargos_ids in company_settings
    if (newTipo !== undefined && settingsId) {
      const currentCargosIds = [...policy.cargos_ids];
      let updatedCargosIds: string[];
      if (newTipo === "escalonada") {
        updatedCargosIds = currentCargosIds.includes(cargoId) ? currentCargosIds : [...currentCargosIds, cargoId];
      } else {
        updatedCargosIds = currentCargosIds.filter(id => id !== cargoId);
      }
      const updatedPolicy = { ...policy, cargos_ids: updatedCargosIds };
      const { error: policyError } = await (supabase
        .from("company_settings") as any)
        .update({ comissao_policy: updatedPolicy })
        .eq("id", settingsId);
      if (policyError) {
        toast.error("Erro ao salvar tipo de comissão: " + policyError.message);
        return;
      }
      refreshPolicy();
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from("cargos").update(updates).eq("id", cargoId);
      if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    }

    toast.success("Cargo salvo!");
    setEditPerms(prev => { const n = { ...prev }; delete n[cargoId]; return n; });
    setEditingName(prev => { const n = { ...prev }; delete n[cargoId]; return n; });
    setEditComissao(prev => { const n = { ...prev }; delete n[cargoId]; return n; });
    setEditTipoComissao(prev => { const n = { ...prev }; delete n[cargoId]; return n; });
    setEditSalario(prev => { const n = { ...prev }; delete n[cargoId]; return n; });
    refresh();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Cadastrar Cargo</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label>Nome do Cargo</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Vendedor" className="mt-1" />
            </div>
            <Button onClick={handleAdd} className="gap-2"><Plus className="h-4 w-4" />Adicionar</Button>
          </div>
        </CardContent>
      </Card>

      {cargos.map(cargo => {
        const perms = editPerms[cargo.id] || cargo.permissoes;
        const comissao = editComissao[cargo.id] ?? cargo.comissao_percentual;
        const tipoComissao = getCargoTipoComissao(cargo.id);
        const salarioVal = editSalario[cargo.id] ?? ((cargo as any).salario_base ? (cargo as any).salario_base.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "");

        return (
          <Card key={cargo.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                {editingName[cargo.id] !== undefined ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editingName[cargo.id]}
                      onChange={e => setEditingName(prev => ({ ...prev, [cargo.id]: e.target.value }))}
                      className="h-8 w-48"
                    />
                    <Button size="sm" variant="ghost" onClick={() => setEditingName(prev => { const n = { ...prev }; delete n[cargo.id]; return n; })}><X className="h-3 w-3" /></Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{cargo.nome}</CardTitle>
                    <Button size="sm" variant="ghost" onClick={() => setEditingName(prev => ({ ...prev, [cargo.id]: cargo.nome }))}><Pencil className="h-3 w-3" /></Button>
                  </div>
                )}
                <div className="flex gap-2">
                  {hasChanges(cargo.id) && (
                    <Button size="sm" onClick={() => handleSave(cargo.id)} className="gap-1"><Save className="h-3 w-3" />Salvar</Button>
                  )}
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(cargo.id, cargo.nome)} className="gap-1"><Trash2 className="h-3 w-3" />Excluir</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Commission type selector */}
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-semibold">Tipo de Comissão</Label>
                    <p className="text-[10px] text-muted-foreground">Selecione o modelo de comissão para este cargo</p>
                  </div>
                  <Select
                    value={tipoComissao}
                    onValueChange={(v) => setEditTipoComissao(prev => ({ ...prev, [cargo.id]: v }))}
                  >
                    <SelectTrigger className="w-44 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixa">
                        <span className="flex items-center gap-1.5">
                          <DollarSign className="h-3 w-3 text-emerald-600" />
                          Comissão Fixa
                        </span>
                      </SelectItem>
                      <SelectItem value="escalonada">
                        <span className="flex items-center gap-1.5">
                          <TrendingUp className="h-3 w-3 text-blue-600" />
                          Comissão Escalonada
                        </span>
                      </SelectItem>
                      <SelectItem value="clt">
                        <span className="flex items-center gap-1.5">
                          <Landmark className="h-3 w-3 text-purple-600" />
                          CLT (Salário + Comissão)
                        </span>
                      </SelectItem>
                      <SelectItem value="clt_only">
                        <span className="flex items-center gap-1.5">
                          <Landmark className="h-3 w-3 text-orange-600" />
                          CLT (Apenas Salário Fixo)
                        </span>
                      </SelectItem>
                      <SelectItem value="clt_escalonada">
                        <span className="flex items-center gap-1.5">
                          <TrendingUp className="h-3 w-3 text-indigo-600" />
                          CLT (Salário + Comissão Escalonada)
                        </span>
                      </SelectItem>
                      <SelectItem value="mei">
                        <span className="flex items-center gap-1.5">
                          <DollarSign className="h-3 w-3 text-teal-600" />
                          MEI (Salário + Comissão)
                        </span>
                      </SelectItem>
                      <SelectItem value="mei_only">
                        <span className="flex items-center gap-1.5">
                          <DollarSign className="h-3 w-3 text-cyan-600" />
                          MEI (Só Comissão)
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {tipoComissao === "fixa" ? (
                  <div className="flex items-center gap-4 rounded-md border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800 p-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                        <Label className="text-xs font-medium">Comissão fixa sobre vendas (%)</Label>
                      </div>
                      <p className="text-[10px] text-muted-foreground ml-5">Percentual fixo calculado sobre o valor à vista da venda</p>
                    </div>
                    <div className="w-24">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={comissao}
                        onChange={e => setEditComissao(prev => ({ ...prev, [cargo.id]: parseFloat(e.target.value) || 0 }))}
                        className="h-8 text-sm text-right"
                      />
                    </div>
                  </div>
                ) : tipoComissao === "escalonada" ? (
                  <div className="rounded-md border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800 p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
                      <Label className="text-xs font-medium">Comissão Escalonada por Metas</Label>
                      <Badge variant="outline" className="text-[9px] ml-auto border-blue-300 text-blue-700 dark:text-blue-400">
                        {policy.faixas.length} faixas configuradas
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground ml-5">
                      Comissão calculada automaticamente conforme o valor da venda. Configure as faixas em <strong>Configurações &gt; Comissões</strong>.
                    </p>
                    <div className="mt-2 max-h-40 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="text-[10px]">
                            <TableHead className="py-1 text-[10px]">Faixa</TableHead>
                            <TableHead className="py-1 text-[10px] text-center">Base</TableHead>
                            <TableHead className="py-1 text-[10px] text-center">Prêmio</TableHead>
                            <TableHead className="py-1 text-[10px] text-center">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {policy.faixas.map((f, i) => (
                            <TableRow key={i} className="text-[10px]">
                              <TableCell className="py-0.5 text-[10px]">
                                {f.min.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} — {f.max.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                              </TableCell>
                              <TableCell className="py-0.5 text-center text-[10px]">{f.comissao}%</TableCell>
                              <TableCell className="py-0.5 text-center text-[10px]">{f.premio}%</TableCell>
                              <TableCell className="py-0.5 text-center text-[10px] font-semibold text-blue-700 dark:text-blue-400">{f.comissao + f.premio}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : tipoComissao === "clt" ? (
                  <div className="rounded-md border border-purple-200 bg-purple-50/50 dark:bg-purple-950/20 dark:border-purple-800 p-3 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <Landmark className="h-3.5 w-3.5 text-purple-600" />
                      <Label className="text-xs font-medium">CLT — Salário Fixo + Comissão</Label>
                    </div>
                    <p className="text-[10px] text-muted-foreground ml-5">
                      Funcionário com registro CLT recebe salário fixo configurado no cadastro + comissão fixa sobre vendas.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-[10px]">Salário Fixo</Label>
                        <Input
                          value={salarioVal}
                          onChange={e => setEditSalario(prev => ({ ...prev, [cargo.id]: maskCurrency(e.target.value) }))}
                          className="h-8 text-sm"
                          placeholder="R$ 0,00"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">Comissão sobre vendas (%)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={comissao}
                          onChange={e => setEditComissao(prev => ({ ...prev, [cargo.id]: parseFloat(e.target.value) || 0 }))}
                          className="h-8 text-sm text-right"
                        />
                      </div>
                    </div>
                  </div>
                ) : tipoComissao === "clt_only" ? (
                  <div className="rounded-md border border-orange-200 bg-orange-50/50 dark:bg-orange-950/20 dark:border-orange-800 p-3 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <Landmark className="h-3.5 w-3.5 text-orange-600" />
                      <Label className="text-xs font-medium">CLT — Apenas Salário Fixo</Label>
                    </div>
                    <p className="text-[10px] text-muted-foreground ml-5">
                      Funcionário CLT recebe apenas o salário fixo, sem comissão sobre vendas.
                    </p>
                    <div className="w-48">
                      <Label className="text-[10px]">Salário Fixo</Label>
                      <Input
                        value={salarioVal}
                        onChange={e => setEditSalario(prev => ({ ...prev, [cargo.id]: maskCurrency(e.target.value) }))}
                        className="h-8 text-sm"
                        placeholder="R$ 0,00"
                      />
                    </div>
                  </div>
                ) : tipoComissao === "clt_escalonada" ? (
                  <div className="rounded-md border border-indigo-200 bg-indigo-50/50 dark:bg-indigo-950/20 dark:border-indigo-800 p-3 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-indigo-600" />
                      <Label className="text-xs font-medium">CLT — Salário + Comissão Escalonada</Label>
                      <Badge variant="outline" className="text-[9px] ml-auto border-indigo-300 text-indigo-700 dark:text-indigo-400">
                        {policy.faixas.length} faixas
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground ml-5">
                      CLT recebe salário fixo + comissão escalonada por metas. Configure as faixas em <strong>Configurações &gt; Comissões</strong>.
                    </p>
                    <div className="w-48">
                      <Label className="text-[10px]">Salário Fixo</Label>
                      <Input
                        value={salarioVal}
                        onChange={e => setEditSalario(prev => ({ ...prev, [cargo.id]: maskCurrency(e.target.value) }))}
                        className="h-8 text-sm"
                        placeholder="R$ 0,00"
                      />
                    </div>
                    <div className="mt-2 max-h-40 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="text-[10px]">
                            <TableHead className="py-1 text-[10px]">Faixa</TableHead>
                            <TableHead className="py-1 text-[10px] text-center">Base</TableHead>
                            <TableHead className="py-1 text-[10px] text-center">Prêmio</TableHead>
                            <TableHead className="py-1 text-[10px] text-center">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {policy.faixas.map((f, i) => (
                            <TableRow key={i} className="text-[10px]">
                              <TableCell className="py-0.5 text-[10px]">
                                {f.min.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} — {f.max.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                              </TableCell>
                              <TableCell className="py-0.5 text-center text-[10px]">{f.comissao}%</TableCell>
                              <TableCell className="py-0.5 text-center text-[10px]">{f.premio}%</TableCell>
                              <TableCell className="py-0.5 text-center text-[10px] font-semibold text-indigo-700 dark:text-indigo-400">{f.comissao + f.premio}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : tipoComissao === "mei" ? (
                  <div className="rounded-md border border-teal-200 bg-teal-50/50 dark:bg-teal-950/20 dark:border-teal-800 p-3 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 text-teal-600" />
                      <Label className="text-xs font-medium">MEI — Salário + Comissão</Label>
                    </div>
                    <p className="text-[10px] text-muted-foreground ml-5">
                      Prestador MEI recebe valor fixo acordado + comissão sobre vendas.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-[10px]">Salário / Valor Fixo</Label>
                        <Input
                          value={salarioVal}
                          onChange={e => setEditSalario(prev => ({ ...prev, [cargo.id]: maskCurrency(e.target.value) }))}
                          className="h-8 text-sm"
                          placeholder="R$ 0,00"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">Comissão sobre vendas (%)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={comissao}
                          onChange={e => setEditComissao(prev => ({ ...prev, [cargo.id]: parseFloat(e.target.value) || 0 }))}
                          className="h-8 text-sm text-right"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-cyan-200 bg-cyan-50/50 dark:bg-cyan-950/20 dark:border-cyan-800 p-3 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 text-cyan-600" />
                      <Label className="text-xs font-medium">MEI — Só Comissão</Label>
                    </div>
                    <p className="text-[10px] text-muted-foreground ml-5">
                      Prestador MEI recebe apenas comissão sobre vendas, sem valor fixo.
                    </p>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <Label className="text-[10px]">Comissão sobre vendas (%)</Label>
                      </div>
                      <div className="w-24">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={comissao}
                          onChange={e => setEditComissao(prev => ({ ...prev, [cargo.id]: parseFloat(e.target.value) || 0 }))}
                          className="h-8 text-sm text-right"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Collapsible open={openCards[cargo.id] || false} onOpenChange={(v) => setOpenCards(prev => ({ ...prev, [cargo.id]: v }))}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between gap-2 text-muted-foreground hover:text-foreground">
                    <span className="text-xs font-medium">Permissões de Acesso</span>
                    {openCards[cargo.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-secondary/50">
                        <TableHead>Função</TableHead>
                        <TableHead className="w-24 text-center">Acesso</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(Object.keys(PERM_LABELS) as Array<keyof CargoPermissoes>).map(key => (
                        <TableRow key={key}>
                          <TableCell>{PERM_LABELS[key]}</TableCell>
                          <TableCell className="text-center">
                            <Switch checked={perms[key]} onCheckedChange={() => togglePerm(cargo.id, cargo.permissoes, key)} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
