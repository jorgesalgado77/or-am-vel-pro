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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Trash2, Save, Pencil, X, ChevronDown, ChevronRight, TrendingUp, DollarSign, Landmark, Copy, Shield, EyeOff, Search, Download, Upload, HelpCircle, Bot, Loader2, CheckCircle2, Power } from "lucide-react";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { useCargos, type CargoPermissoes } from "@/hooks/useCargos";
import { useComissaoPolicy } from "@/hooks/useComissaoPolicy";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { getTenantId } from "@/lib/tenantState";

// ── Labels + Tooltips ────────────────────────────────────────

interface PermMeta { label: string; tip: string }

const PERM_META_CORE: Record<string, PermMeta> = {
  clientes: { label: "Clientes", tip: "Acesso ao Kanban de clientes e fichas de cadastro" },
  simulador: { label: "Negociação", tip: "Criar e editar simulações de orçamento/propostas" },
  configuracoes: { label: "Configurações", tip: "Acesso às configurações gerais da loja (APIs, regras, etc.)" },
  desconto1: { label: "Desconto 1", tip: "Permite aplicar o primeiro nível de desconto à vista" },
  desconto2: { label: "Desconto 2", tip: "Permite aplicar o segundo nível de desconto condicional" },
  desconto3: { label: "Desconto 3", tip: "Permite aplicar desconto especial — geralmente restrito a gerentes" },
  plus: { label: "Plus", tip: "Acesso ao desconto Plus aplicado antes do financiamento" },
};

const PERM_META_MENU: Record<string, PermMeta> = {
  ia_gerente: { label: "IA Gerente", tip: "Acesso ao módulo de inteligência artificial para gestão" },
  catalogo: { label: "Catálogo", tip: "Visualizar produtos no catálogo da loja" },
  cadastrar_produtos: { label: "Cadastrar Produtos", tip: "Adicionar, editar e remover produtos do catálogo" },
  medicao: { label: "Solicitação Medidas", tip: "Solicitar e agendar medições técnicas para clientes" },
  liberacao: { label: "Liberação", tip: "Liberar orçamentos e pedidos para produção" },
  liberacao_tecnica: { label: "Liberação Técnica", tip: "Aprovar detalhes técnicos antes da produção" },
  tutoriais: { label: "Tutoriais", tip: "Acesso à central de tutoriais e ajuda do sistema" },
  email: { label: "Email", tip: "Enviar e-mails pelo sistema para clientes" },
  folha_pagamento: { label: "Folha de Pagamento", tip: "Acesso ao módulo de folha de pagamento e holerites" },
  financeiro: { label: "Financeiro", tip: "Acesso a contas a pagar/receber e fluxo de caixa" },
  planos: { label: "Planos de Assinatura", tip: "Gerenciar planos e assinaturas da loja" },
  funil: { label: "Funil de Captação", tip: "Acesso ao funil de captura de leads e landing pages" },
  campanhas: { label: "Campanhas", tip: "Criar e gerenciar campanhas de marketing e disparo em massa" },
  indicacoes: { label: "Indicações", tip: "Ver e gerenciar indicações de clientes" },
  vendazap: { label: "VendaZap AI", tip: "Acesso ao bot de vendas automático via WhatsApp" },
  chat_vendas: { label: "Chat Vendas", tip: "Chat em tempo real com clientes via WhatsApp" },
  dealroom: { label: "Deal Room", tip: "Sala de negociação com vídeo, transcrição e IA" },
  smart3d: { label: "3D Smart Import", tip: "Importar projetos 3D (PROMOB, TXT, XML)" },
  divulgue_ganhe: { label: "Divulgue e Ganhe", tip: "Programa de indicação e recompensas" },
  mensagens: { label: "Mensagens", tip: "Central de mensagens internas e notificações" },
  suporte: { label: "Suporte", tip: "Acesso ao módulo de suporte técnico" },
};

const PERM_META_DASHBOARD: Record<string, PermMeta> = {
  dash_ia_auto: { label: "IA Auto Aprendizado", tip: "Seção de insights automáticos gerados pela IA no Dashboard" },
  dash_kpis: { label: "KPIs (Indicadores)", tip: "Cards de faturamento, ticket médio e taxa de conversão" },
  dash_leads_origem: { label: "Leads por Origem", tip: "Gráfico de origem dos leads (WhatsApp, Landing Page, etc.)" },
  dash_graficos: { label: "Gráficos", tip: "Gráficos de desempenho de vendas e tendências" },
  dash_projetista: { label: "Detalhes por Projetista", tip: "Ranking e métricas individuais dos projetistas" },
  dash_indicador: { label: "Detalhes por Indicador", tip: "Métricas de indicadores de desempenho detalhados" },
  dash_produtos_vendidos: { label: "Produtos Mais Vendidos", tip: "Ranking dos produtos com maior volume de vendas" },
  dash_contratos: { label: "Contratos Fechados / Acompanhamento", tip: "Listagem e progresso de contratos fechados" },
  dash_medicao: { label: "Agendamento de Medição", tip: "Agenda de medições técnicas no Dashboard" },
  dash_estoque: { label: "Alertas de Estoque Baixo", tip: "Alertas automáticos quando produtos atingem estoque mínimo" },
};

const PERM_META_MIA: Record<string, PermMeta> = {
  mia_alertas_proativos: { label: "Alertas Proativos", tip: "MIA envia alertas automáticos sobre leads parados, tarefas atrasadas e mensagens pendentes" },
  mia_kpis: { label: "KPIs e Métricas", tip: "MIA pode informar faturamento, metas, taxa de conversão e indicadores" },
  mia_leads: { label: "Informações de Leads", tip: "MIA mostra dados de leads, status no funil e sugestões de follow-up" },
  mia_mensagens: { label: "Mensagens Pendentes", tip: "MIA alerta sobre mensagens de clientes sem resposta" },
  mia_tarefas: { label: "Gestão de Tarefas", tip: "MIA informa tarefas atrasadas e pendentes do usuário ou equipe" },
  mia_financeiro: { label: "Dados Financeiros", tip: "MIA pode acessar e informar dados do financeiro (contas, fluxo de caixa)" },
  mia_estoque: { label: "Alertas de Estoque", tip: "MIA avisa sobre produtos com estoque baixo ou zerado" },
  mia_medicoes: { label: "Medições Pendentes", tip: "MIA informa medições agendadas ou pendentes de execução" },
  mia_contratos: { label: "Dados de Contratos", tip: "MIA mostra informações sobre contratos fechados e em andamento" },
  mia_fluxo_vendas: { label: "Fluxo de Vendas", tip: "MIA orienta o passo-a-passo do fluxo completo de vendas" },
  mia_pesquisa_mercado: { label: "Pesquisa de Mercado", tip: "MIA pode buscar informações de mercado e tendências para enriquecer respostas" },
  mia_criar_tarefas: { label: "Criar Tarefas", tip: "MIA pode criar tarefas automaticamente via chat" },
  mia_enviar_email: { label: "Enviar E-mails", tip: "MIA pode redigir e enviar e-mails para clientes" },
  mia_followup_auto: { label: "Follow-up Automático", tip: "MIA pode disparar follow-ups automáticos para leads parados" },
};

// Legacy flat labels for compatibility
const PERM_LABELS_CORE: Record<string, string> = Object.fromEntries(Object.entries(PERM_META_CORE).map(([k, v]) => [k, v.label]));
const PERM_LABELS_MENU: Record<string, string> = Object.fromEntries(Object.entries(PERM_META_MENU).map(([k, v]) => [k, v.label]));
const PERM_LABELS_DASHBOARD: Record<string, string> = Object.fromEntries(Object.entries(PERM_META_DASHBOARD).map(([k, v]) => [k, v.label]));

const PERM_LABELS: Record<keyof CargoPermissoes, string> = {
  ...PERM_LABELS_CORE,
  ...PERM_LABELS_MENU,
  ...PERM_LABELS_DASHBOARD,
  ...Object.fromEntries(Object.entries(PERM_META_MIA).map(([k, v]) => [k, v.label])),
} as Record<keyof CargoPermissoes, string>;

// Unified tooltip map
const ALL_TOOLTIPS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(PERM_META_CORE).map(([k, v]) => [k, v.tip])),
  ...Object.fromEntries(Object.entries(PERM_META_MENU).map(([k, v]) => [k, v.tip])),
  ...Object.fromEntries(Object.entries(PERM_META_DASHBOARD).map(([k, v]) => [k, v.tip])),
  ...Object.fromEntries(Object.entries(PERM_META_MIA).map(([k, v]) => [k, v.tip])),
};

// ── Permission row with tooltip ──────────────────────────────

function PermRow({ permKey, label, checked, onToggle }: { permKey: string; label: string; checked: boolean; onToggle: () => void }) {
  const tip = ALL_TOOLTIPS[permKey];
  return (
    <TableRow key={permKey}>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{label}</span>
          {tip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[240px] text-xs">{tip}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell className="text-center">
        <Switch checked={checked} onCheckedChange={onToggle} />
      </TableCell>
    </TableRow>
  );
}

// ── Component ────────────────────────────────────────────────

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
  const [searchTerm, setSearchTerm] = useState("");

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

  const handleDuplicate = async (cargo: typeof cargos[0]) => {
    const tenantId = getTenantId();
    if (!tenantId) { toast.error("Sessão inválida"); return; }
    const { error } = await supabase.from("cargos").insert({
      nome: `${cargo.nome} (cópia)`,
      permissoes: cargo.permissoes as any,
      comissao_percentual: cargo.comissao_percentual,
      tipo_comissao: (cargo as any).tipo_comissao || null,
      salario_base: (cargo as any).salario_base || null,
      tenant_id: tenantId,
    });
    if (error) toast.error("Erro ao duplicar: " + error.message);
    else { toast.success("Cargo duplicado!"); refresh(); }
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

  const dashKeys = Object.keys(PERM_LABELS_DASHBOARD);
  const cargosWithHiddenSections = cargos.map(c => {
    const hidden = dashKeys.filter(k => (c.permissoes as any)?.[k] === false);
    return { nome: c.nome, hiddenCount: hidden.length, hiddenLabels: hidden.map(k => PERM_LABELS_DASHBOARD[k]) };
  }).filter(c => c.hiddenCount > 0);

  const filteredCargos = cargos.filter(c =>
    c.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExport = () => {
    const exportData = cargos.map(c => ({
      nome: c.nome,
      permissoes: c.permissoes,
      comissao_percentual: c.comissao_percentual,
      tipo_comissao: (c as any).tipo_comissao || null,
      salario_base: (c as any).salario_base || null,
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cargos_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${cargos.length} cargo(s) exportado(s)!`);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        if (!Array.isArray(imported)) { toast.error("Formato inválido: esperado um array de cargos"); return; }
        const tenantId = getTenantId();
        if (!tenantId) { toast.error("Sessão inválida"); return; }
        let count = 0;
        for (const item of imported) {
          if (!item.nome || !item.permissoes) continue;
          const { error } = await supabase.from("cargos").insert({
            nome: item.nome,
            permissoes: item.permissoes,
            comissao_percentual: item.comissao_percentual || 0,
            tipo_comissao: item.tipo_comissao || null,
            salario_base: item.salario_base || null,
            tenant_id: tenantId,
          });
          if (!error) count++;
        }
        toast.success(`${count} cargo(s) importado(s)!`);
        refresh();
      } catch {
        toast.error("Erro ao ler arquivo JSON");
      }
    };
    input.click();
  };

  // Toggle all MIA permissions for a cargo
  const toggleAllMIA = (cargoId: string, current: CargoPermissoes, enable: boolean) => {
    const existing = editPerms[cargoId] || { ...current };
    const updated = { ...existing };
    for (const key of Object.keys(PERM_META_MIA)) {
      (updated as any)[key] = enable;
    }
    setEditPerms(prev => ({ ...prev, [cargoId]: updated }));
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-6">
        {/* Visual Summary */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Resumo de Cargos</h3>
                <p className="text-xs text-muted-foreground">{cargos.length} cargo{cargos.length !== 1 ? "s" : ""} cadastrado{cargos.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
            {cargosWithHiddenSections.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <EyeOff className="h-3.5 w-3.5" /> Seções ocultas no dashboard:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {cargosWithHiddenSections.map(c => (
                    <div key={c.nome} className="rounded-md border border-border bg-background p-2.5">
                      <p className="text-xs font-semibold text-foreground">{c.nome}</p>
                      <p className="text-[10px] text-muted-foreground line-clamp-2">
                        {c.hiddenLabels.join(", ")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">Todos os cargos possuem todas as seções do dashboard visíveis.</p>
            )}
          </CardContent>
        </Card>

        {/* Search + Export/Import */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar cargo pelo nome..."
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
              <Download className="h-4 w-4" />Exportar JSON
            </Button>
            <Button variant="outline" size="sm" onClick={handleImport} className="gap-1.5">
              <Upload className="h-4 w-4" />Importar JSON
            </Button>
          </div>
        </div>

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

        {filteredCargos.length === 0 && searchTerm && (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum cargo encontrado para "{searchTerm}"</p>
        )}

        {filteredCargos.map(cargo => {
          const perms = editPerms[cargo.id] || cargo.permissoes;
          const comissao = editComissao[cargo.id] ?? cargo.comissao_percentual;
          const tipoComissao = getCargoTipoComissao(cargo.id);
          const salarioVal = editSalario[cargo.id] ?? ((cargo as any).salario_base ? (cargo as any).salario_base.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "");

          // Count active MIA permissions
          const miaKeys = Object.keys(PERM_META_MIA);
          const miaActive = miaKeys.filter(k => (perms as any)[k] !== false).length;
          const allMiaOn = miaActive === miaKeys.length;

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
                    <Button size="sm" variant="outline" onClick={() => handleDuplicate(cargo)} className="gap-1"><Copy className="h-3 w-3" />Duplicar</Button>
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
                          type="number" min={0} max={100} step={0.5}
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
                      <p className="text-[10px] text-muted-foreground ml-5">Funcionário com registro CLT recebe salário fixo + comissão fixa sobre vendas.</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-[10px]">Salário Fixo</Label>
                          <Input value={salarioVal} onChange={e => setEditSalario(prev => ({ ...prev, [cargo.id]: maskCurrency(e.target.value) }))} className="h-8 text-sm" placeholder="R$ 0,00" />
                        </div>
                        <div>
                          <Label className="text-[10px]">Comissão sobre vendas (%)</Label>
                          <Input type="number" min={0} max={100} step={0.5} value={comissao} onChange={e => setEditComissao(prev => ({ ...prev, [cargo.id]: parseFloat(e.target.value) || 0 }))} className="h-8 text-sm text-right" />
                        </div>
                      </div>
                    </div>
                  ) : tipoComissao === "clt_only" ? (
                    <div className="rounded-md border border-orange-200 bg-orange-50/50 dark:bg-orange-950/20 dark:border-orange-800 p-3 space-y-3">
                      <div className="flex items-center gap-1.5">
                        <Landmark className="h-3.5 w-3.5 text-orange-600" />
                        <Label className="text-xs font-medium">CLT — Apenas Salário Fixo</Label>
                      </div>
                      <p className="text-[10px] text-muted-foreground ml-5">Funcionário CLT recebe apenas o salário fixo, sem comissão.</p>
                      <div className="w-48">
                        <Label className="text-[10px]">Salário Fixo</Label>
                        <Input value={salarioVal} onChange={e => setEditSalario(prev => ({ ...prev, [cargo.id]: maskCurrency(e.target.value) }))} className="h-8 text-sm" placeholder="R$ 0,00" />
                      </div>
                    </div>
                  ) : tipoComissao === "clt_escalonada" ? (
                    <div className="rounded-md border border-indigo-200 bg-indigo-50/50 dark:bg-indigo-950/20 dark:border-indigo-800 p-3 space-y-3">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-indigo-600" />
                        <Label className="text-xs font-medium">CLT — Salário + Comissão Escalonada</Label>
                        <Badge variant="outline" className="text-[9px] ml-auto border-indigo-300 text-indigo-700 dark:text-indigo-400">{policy.faixas.length} faixas</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground ml-5">CLT recebe salário fixo + comissão escalonada por metas.</p>
                      <div className="w-48">
                        <Label className="text-[10px]">Salário Fixo</Label>
                        <Input value={salarioVal} onChange={e => setEditSalario(prev => ({ ...prev, [cargo.id]: maskCurrency(e.target.value) }))} className="h-8 text-sm" placeholder="R$ 0,00" />
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
                      <p className="text-[10px] text-muted-foreground ml-5">Prestador MEI recebe valor fixo acordado + comissão sobre vendas.</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-[10px]">Salário / Valor Fixo</Label>
                          <Input value={salarioVal} onChange={e => setEditSalario(prev => ({ ...prev, [cargo.id]: maskCurrency(e.target.value) }))} className="h-8 text-sm" placeholder="R$ 0,00" />
                        </div>
                        <div>
                          <Label className="text-[10px]">Comissão sobre vendas (%)</Label>
                          <Input type="number" min={0} max={100} step={0.5} value={comissao} onChange={e => setEditComissao(prev => ({ ...prev, [cargo.id]: parseFloat(e.target.value) || 0 }))} className="h-8 text-sm text-right" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-cyan-200 bg-cyan-50/50 dark:bg-cyan-950/20 dark:border-cyan-800 p-3 space-y-3">
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="h-3.5 w-3.5 text-cyan-600" />
                        <Label className="text-xs font-medium">MEI — Só Comissão</Label>
                      </div>
                      <p className="text-[10px] text-muted-foreground ml-5">Prestador MEI recebe apenas comissão sobre vendas.</p>
                      <div className="flex items-center gap-4">
                        <div className="flex-1"><Label className="text-[10px]">Comissão sobre vendas (%)</Label></div>
                        <div className="w-24">
                          <Input type="number" min={0} max={100} step={0.5} value={comissao} onChange={e => setEditComissao(prev => ({ ...prev, [cargo.id]: parseFloat(e.target.value) || 0 }))} className="h-8 text-sm text-right" />
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
                  <CollapsibleContent className="space-y-4">
                    {/* ── Permissões Gerais ── */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 px-2">Permissões Gerais</p>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-secondary/50">
                            <TableHead>Função</TableHead>
                            <TableHead className="w-24 text-center">Acesso</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(Object.keys(PERM_META_CORE) as Array<keyof CargoPermissoes>).map(key => (
                            <PermRow
                              key={key}
                              permKey={key}
                              label={PERM_META_CORE[key].label}
                              checked={perms[key] ?? true}
                              onToggle={() => togglePerm(cargo.id, cargo.permissoes, key)}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* ── Menu Lateral ── */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 px-2">Funções do Menu Lateral</p>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-secondary/50">
                            <TableHead>Função</TableHead>
                            <TableHead className="w-24 text-center">Acesso</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(Object.keys(PERM_META_MENU) as Array<keyof CargoPermissoes>).map(key => (
                            <PermRow
                              key={key}
                              permKey={key}
                              label={PERM_META_MENU[key].label}
                              checked={perms[key] ?? true}
                              onToggle={() => togglePerm(cargo.id, cargo.permissoes, key)}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* ── Dashboard ── */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 px-2">Seções do Dashboard</p>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-secondary/50">
                            <TableHead>Seção</TableHead>
                            <TableHead className="w-24 text-center">Visível</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(Object.keys(PERM_META_DASHBOARD) as Array<keyof CargoPermissoes>).map(key => (
                            <PermRow
                              key={key}
                              permKey={key}
                              label={PERM_META_DASHBOARD[key].label}
                              checked={perms[key] ?? true}
                              onToggle={() => togglePerm(cargo.id, cargo.permissoes, key)}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* ── MIA (Assistente IA) ── */}
                    <div>
                      <div className="flex items-center justify-between mb-2 px-2">
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4 text-primary" />
                          <p className="text-xs font-semibold text-primary">MIA — Assistente Inteligente</p>
                          <Badge variant="outline" className="text-[9px]">{miaActive}/{miaKeys.length} ativas</Badge>
                        </div>
                        <div className="flex gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => toggleAllMIA(cargo.id, cargo.permissoes, true)}
                            disabled={allMiaOn}
                          >
                            Ativar Todas
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => toggleAllMIA(cargo.id, cargo.permissoes, false)}
                            disabled={miaActive === 0}
                          >
                            Desativar Todas
                          </Button>
                        </div>
                      </div>
                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 mb-2">
                        <p className="text-[10px] text-muted-foreground">
                          Controle quais informações e ações a MIA pode fornecer e executar para este cargo. 
                          Funções desativadas não serão exibidas nos alertas proativos nem nas respostas da IA.
                        </p>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-primary/10">
                            <TableHead>Função da MIA</TableHead>
                            <TableHead className="w-24 text-center">Ativo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(Object.keys(PERM_META_MIA) as Array<keyof CargoPermissoes>).map(key => (
                            <PermRow
                              key={key}
                              permKey={key}
                              label={PERM_META_MIA[key].label}
                              checked={perms[key] ?? true}
                              onToggle={() => togglePerm(cargo.id, cargo.permissoes, key)}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
