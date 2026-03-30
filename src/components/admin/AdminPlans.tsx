import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus, Edit, Trash2, RefreshCw, Crown, Users, Zap, Star, GripVertical,
  Check, X, Save, Sparkles, Loader2, Wand2, Copy, Eye,
} from "lucide-react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";

interface SubscriptionPlan {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  preco_mensal: number;
  preco_anual_mensal: number;
  max_usuarios: number;
  destaque: boolean;
  ativo: boolean;
  ordem: number;
  trial_dias: number;
  funcionalidades: Record<string, boolean>;
  features_display: { label: string; included: boolean }[];
  created_at: string;
}

const ALL_FEATURES: { key: string; label: string; description: string }[] = [
  { key: "clientes", label: "Gestão de Clientes", description: "Cadastro e gerenciamento de clientes" },
  { key: "kanban", label: "Kanban de Clientes", description: "Visualização Kanban do pipeline" },
  { key: "simulador", label: "Simulador de Financiamento", description: "Simulação de parcelas e financiamentos" },
  { key: "catalogo_produtos", label: "Catálogo de Produtos", description: "Gestão do catálogo de produtos e ambientes" },
  { key: "contratos", label: "Contratos Digitais", description: "Geração e gestão de contratos" },
  { key: "configuracoes", label: "Configurações Avançadas", description: "Acesso às configurações do sistema" },
  { key: "desconto1", label: "Desconto 1", description: "Primeiro nível de desconto" },
  { key: "desconto2", label: "Desconto 2", description: "Segundo nível de desconto" },
  { key: "desconto3", label: "Desconto 3 (Especial)", description: "Terceiro nível de desconto avançado" },
  { key: "plus", label: "Desconto Plus", description: "Desconto adicional sobre o valor à vista/Pix" },
  { key: "deal_room", label: "Deal Room", description: "Sala de negociação premium" },
  { key: "vendazap", label: "VendaZap AI", description: "Assistente de vendas com IA via WhatsApp" },
  { key: "mia_assistente", label: "Assistente Virtual Mia", description: "Assistente inteligente para CRM, tarefas e buscas" },
  { key: "ia_diretora_comercial", label: "IA Diretora Comercial", description: "Previsões de faturamento, metas e relatórios estratégicos" },
  { key: "ia_gerente_comercial", label: "IA Gerente Comercial", description: "Motor de decisão, arbitragem e controle de negociação" },
  { key: "financeiro", label: "Financeiro e Folha de Pagamento", description: "Gestão financeira, contas, previsão de caixa e folha" },
  { key: "funil_captacao", label: "Funil de Captação", description: "Pipeline de captação de leads e métricas de conversão" },
  { key: "campanhas", label: "Campanhas", description: "Criação e agendamento de campanhas de marketing" },
  { key: "smart_import_3d", label: "3D Smart Import", description: "Importação e visualização 3D de projetos" },
  { key: "divulgue_ganhe", label: "Divulgue e Ganhe", description: "Programa de afiliados e indicação com comissões" },
  { key: "indicadores", label: "Indicadores", description: "Gestão de indicadores de vendas" },
  { key: "comissoes", label: "Comissões", description: "Controle de comissões e folha" },
  { key: "dashboard_avancado", label: "Dashboard Avançado", description: "KPIs e relatórios detalhados com IA" },
  { key: "suporte_prioritario", label: "Suporte Prioritário", description: "Atendimento prioritário" },
  { key: "ocultar_indicador", label: "Ocultar Indicador (VIP)", description: "Permite ocultar dados do indicador na negociação" },
];

const ICON_MAP: Record<string, React.ElementType> = {
  trial: Zap,
  basico: Users,
  premium: Crown,
};

// Live preview component matching landing page style
function PlanPreview({
  nome, descricao, preco_mensal, preco_anual_mensal, max_usuarios, destaque, trial_dias, features_display, annual,
}: {
  nome: string; descricao: string; preco_mensal: number; preco_anual_mensal: number;
  max_usuarios: number; destaque: boolean; trial_dias: number;
  features_display: { label: string; included: boolean }[]; annual: boolean;
}) {
  const price = annual ? preco_anual_mensal : preco_mensal;
  return (
    <div
      className={`bg-white rounded-2xl p-6 border-2 relative transition-all h-full flex flex-col text-gray-900 ${
        destaque ? "shadow-xl border-blue-600 scale-[1.02]" : "shadow-sm border-gray-100"
      }`}
    >
      {destaque && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600 text-white text-[10px] font-bold shadow-lg">
          <Star className="h-3 w-3 fill-white" /> Mais Popular
        </div>
      )}
      <div className="text-center mb-4">
        <h3 className="text-lg font-bold mb-1">{nome || "Nome do Plano"}</h3>
        <p className="text-[11px] text-gray-500 mb-3">{descricao || "Descrição do plano"}</p>
        <div className="flex items-baseline justify-center gap-1">
          {price === 0 ? (
            <span className="text-3xl font-extrabold">Grátis</span>
          ) : (
            <>
              <span className="text-xs text-gray-500">R$</span>
              <span className="text-3xl font-extrabold">{price.toFixed(2).replace(".", ",")}</span>
              <span className="text-xs text-gray-500">/mês</span>
            </>
          )}
        </div>
        {max_usuarios < 999 && <p className="text-[10px] text-gray-500 mt-1">até {max_usuarios} usuários</p>}
        {max_usuarios >= 999 && <p className="text-[10px] text-gray-500 mt-1">usuários ilimitados</p>}
        {trial_dias > 0 && <p className="text-[10px] text-green-600 font-medium mt-1">{trial_dias} dias sem compromisso</p>}
      </div>
      <ul className="space-y-1.5 flex-1">
        {(features_display || []).map((f, j) => (
          <li key={j} className="flex items-start gap-2 text-[11px]">
            {f.included ? <Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-600" /> : <X className="h-3.5 w-3.5 shrink-0 mt-0.5 text-gray-300" />}
            <span className={f.included ? "text-gray-700" : "text-gray-400"}>{f.label}</span>
          </li>
        ))}
      </ul>
      <button
        className={`w-full mt-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
          destaque ? "bg-blue-600 text-white" : "border border-blue-600 text-blue-600"
        }`}
      >
        {price === 0 ? "Começar grátis" : "Começar teste grátis"}
      </button>
    </div>
  );
}

export function AdminPlans() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewAnnual, setPreviewAnnual] = useState(false);

  // Form state
  const [fSlug, setFSlug] = useState("");
  const [fNome, setFNome] = useState("");
  const [fDescricao, setFDescricao] = useState("");
  const [fPrecoMensal, setFPrecoMensal] = useState("0");
  const [fPrecoAnual, setFPrecoAnual] = useState("0");
  const [fMaxUsers, setFMaxUsers] = useState("999");
  const [fDestaque, setFDestaque] = useState(false);
  const [fAtivo, setFAtivo] = useState(true);
  const [fOrdem, setFOrdem] = useState("0");
  const [fTrialDias, setFTrialDias] = useState("0");
  const [fFuncionalidades, setFFuncionalidades] = useState<Record<string, boolean>>({});
  const [fFeatures, setFFeatures] = useState<{ label: string; included: boolean }[]>([]);
  const [newFeatureLabel, setNewFeatureLabel] = useState("");
  const [editingFeatureIndex, setEditingFeatureIndex] = useState<number | null>(null);
  const [editingFeatureLabel, setEditingFeatureLabel] = useState("");
  const [fDescontoAnual, setFDescontoAnual] = useState("20");
  const [saving, setSaving] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [suggestingFeatures, setSuggestingFeatures] = useState(false);

  const SUGGESTED_FEATURES_MAP: Record<string, string[]> = {
    trial: [
      "Acesso ao simulador básico", "Até 3 clientes", "Dashboard simplificado",
      "Suporte via e-mail", "Válido por 7 dias",
    ],
    basico: [
      "Gestão completa de clientes", "Simulador de financiamento", "Dashboard com KPIs",
      "Contratos digitais", "Kanban de pipeline", "Suporte prioritário",
      "Até 3 usuários", "Relatórios básicos",
    ],
    premium: [
      "Tudo do plano Básico", "Usuários ilimitados", "VendaZap AI integrado",
      "Deal Room premium", "Comissões escalonadas", "Dashboard avançado com IA",
      "Suporte VIP dedicado", "Relatórios financeiros completos",
      "Previsão de caixa com IA", "Indicadores de performance",
    ],
  };

  const generateDescription = async () => {
    if (!fNome.trim()) { toast.error("Informe o nome do plano primeiro"); return; }
    setGeneratingDesc(true);
    const enabledFeats = ALL_FEATURES.filter(f => fFuncionalidades[f.key]).map(f => f.label);
    const preco = parseFloat(fPrecoMensal) || 0;
    try {
      const { data, error } = await supabase.functions.invoke("plan-ai", {
        body: { action: "generate_description", plan_name: fNome.trim(), plan_slug: fSlug.trim(), enabled_features: enabledFeats, price: preco },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const result = data?.result?.trim();
      if (result) { setFDescricao(result); toast.success("Descrição gerada com IA!"); }
      else throw new Error("Resposta vazia da IA");
    } catch (err: any) {
      console.warn("[AdminPlans] AI description fallback:", err);
      const enabledFeats2 = ALL_FEATURES.filter(f => fFuncionalidades[f.key]).map(f => f.label);
      if (preco === 0) setFDescricao(`Experimente o ${fNome} gratuitamente e descubra como o OrçaMóvel PRO pode transformar suas vendas de móveis planejados.`);
      else if (preco <= 80) setFDescricao(`O plano ${fNome} é ideal para lojas que buscam profissionalizar a gestão de vendas com ${enabledFeats2.length} funcionalidades essenciais por apenas R$ ${preco.toFixed(2).replace(".", ",")}/mês.`);
      else setFDescricao(`O plano ${fNome} oferece a experiência completa do OrçaMóvel PRO com ${enabledFeats2.length} funcionalidades avançadas, incluindo ${enabledFeats2.slice(0, 3).join(", ")} e muito mais.`);
      toast.success("Descrição gerada (local)!");
    } finally { setGeneratingDesc(false); }
  };

  const suggestFeatures = async () => {
    if (!fSlug.trim() && !fNome.trim()) { toast.error("Informe o slug ou nome do plano"); return; }
    setSuggestingFeatures(true);
    const enabledFeats = ALL_FEATURES.filter(f => fFuncionalidades[f.key]).map(f => f.label);
    try {
      const { data, error } = await supabase.functions.invoke("plan-ai", {
        body: { action: "suggest_features", plan_name: fNome.trim(), plan_slug: fSlug.trim(), enabled_features: enabledFeats },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const result = data?.result?.trim();
      if (result) {
        const jsonMatch = result.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const suggestions = JSON.parse(jsonMatch[0]) as { label: string; included: boolean }[];
          const newFeats = suggestions.filter(s => !fFeatures.some(f => f.label === s.label));
          if (newFeats.length === 0) toast.info("Todas as sugestões já estão na lista");
          else { setFFeatures(prev => [...prev, ...newFeats]); toast.success(`${newFeats.length} features sugeridas pela IA!`); }
        } else throw new Error("Formato inválido");
      } else throw new Error("Resposta vazia");
    } catch (err: any) {
      console.warn("[AdminPlans] AI suggest fallback:", err);
      const slug = fSlug.trim().toLowerCase();
      const suggestions = SUGGESTED_FEATURES_MAP[slug] || SUGGESTED_FEATURES_MAP.basico;
      const newFeats = suggestions.filter(s => !fFeatures.some(f => f.label === s)).map(label => ({ label, included: true }));
      if (newFeats.length === 0) toast.info("Todas as sugestões já estão na lista");
      else { setFFeatures(prev => [...prev, ...newFeats]); toast.success(`${newFeats.length} features sugeridas adicionadas!`); }
    } finally { setSuggestingFeatures(false); }
  };

  const fetchPlans = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("subscription_plans" as any).select("*").order("ordem", { ascending: true });
    if (error) toast.error("Erro ao carregar planos");
    else setPlans((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchPlans();
    const channel = supabase
      .channel("admin-plans-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_plans" }, () => { fetchPlans(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const resetForm = () => {
    setFSlug(""); setFNome(""); setFDescricao("");
    setFPrecoMensal("0"); setFPrecoAnual("0");
    setFMaxUsers("999"); setFDestaque(false); setFAtivo(true);
    setFOrdem(String(plans.length)); setFTrialDias("0");
    setFDescontoAnual("20");
    const defaultFuncs: Record<string, boolean> = {};
    ALL_FEATURES.forEach(f => { defaultFuncs[f.key] = false; });
    setFFuncionalidades(defaultFuncs);
    setFFeatures([]);
    setNewFeatureLabel("");
    setEditingFeatureIndex(null);
  };

  const openNew = () => {
    setEditing(null);
    resetForm();
    setShowDialog(true);
  };

  const openEdit = (plan: SubscriptionPlan) => {
    setEditing(plan);
    setFSlug(plan.slug); setFNome(plan.nome); setFDescricao(plan.descricao);
    setFPrecoMensal(String(plan.preco_mensal)); setFPrecoAnual(String(plan.preco_anual_mensal));
    setFMaxUsers(String(plan.max_usuarios)); setFDestaque(plan.destaque);
    setFAtivo(plan.ativo); setFOrdem(String(plan.ordem)); setFTrialDias(String(plan.trial_dias));
    const mensal = plan.preco_mensal;
    const anual = plan.preco_anual_mensal;
    if (mensal > 0 && anual > 0 && anual < mensal) setFDescontoAnual(String(Math.round((1 - anual / mensal) * 100)));
    else setFDescontoAnual("20");
    const funcs: Record<string, boolean> = {};
    ALL_FEATURES.forEach(f => { funcs[f.key] = plan.funcionalidades?.[f.key] ?? false; });
    setFFuncionalidades(funcs);
    setFFeatures(plan.features_display || []);
    setNewFeatureLabel(""); setEditingFeatureIndex(null);
    setShowDialog(true);
  };

  const duplicatePlan = (plan: SubscriptionPlan) => {
    setEditing(null);
    setFSlug(plan.slug + "_copy");
    setFNome(plan.nome + " (Cópia)");
    setFDescricao(plan.descricao);
    setFPrecoMensal(String(plan.preco_mensal));
    setFPrecoAnual(String(plan.preco_anual_mensal));
    setFMaxUsers(String(plan.max_usuarios));
    setFDestaque(false);
    setFAtivo(false);
    setFOrdem(String(plans.length));
    setFTrialDias(String(plan.trial_dias));
    const mensal = plan.preco_mensal;
    const anual = plan.preco_anual_mensal;
    if (mensal > 0 && anual > 0 && anual < mensal) setFDescontoAnual(String(Math.round((1 - anual / mensal) * 100)));
    else setFDescontoAnual("20");
    const funcs: Record<string, boolean> = {};
    ALL_FEATURES.forEach(f => { funcs[f.key] = plan.funcionalidades?.[f.key] ?? false; });
    setFFuncionalidades(funcs);
    setFFeatures([...(plan.features_display || [])]);
    setNewFeatureLabel(""); setEditingFeatureIndex(null);
    setShowDialog(true);
    toast.info(`Duplicando plano "${plan.nome}" — ajuste o slug e salve.`);
  };

  const savePlan = async () => {
    if (!fSlug.trim() || !fNome.trim()) { toast.error("Slug e nome são obrigatórios"); return; }
    setSaving(true);
    const payload = {
      slug: fSlug.trim().toLowerCase(), nome: fNome.trim(), descricao: fDescricao.trim(),
      preco_mensal: parseFloat(fPrecoMensal) || 0, preco_anual_mensal: parseFloat(fPrecoAnual) || 0,
      max_usuarios: parseInt(fMaxUsers) || 999, destaque: fDestaque, ativo: fAtivo,
      ordem: parseInt(fOrdem) || 0, trial_dias: parseInt(fTrialDias) || 0,
      funcionalidades: fFuncionalidades, features_display: fFeatures,
    };
    if (editing) {
      const { error } = await supabase.from("subscription_plans" as any).update(payload as any).eq("id", editing.id);
      if (error) toast.error("Erro ao atualizar plano: " + error.message);
      else toast.success("Plano atualizado! Mudanças em tempo real.");
    } else {
      const { error } = await supabase.from("subscription_plans" as any).insert(payload as any);
      if (error) toast.error("Erro ao criar plano: " + error.message);
      else toast.success("Plano criado!");
    }
    setSaving(false); setShowDialog(false); fetchPlans();
  };

  const deletePlan = async (id: string, slug: string) => {
    if (["trial", "basico", "premium"].includes(slug)) { toast.error("Não é possível excluir planos padrão do sistema"); return; }
    if (!confirm("Tem certeza que deseja excluir este plano?")) return;
    await supabase.from("subscription_plans" as any).delete().eq("id", id);
    toast.success("Plano excluído"); fetchPlans();
  };

  const toggleFeature = (key: string) => { setFFuncionalidades(prev => ({ ...prev, [key]: !prev[key] })); };

  const addDisplayFeature = () => {
    if (!newFeatureLabel.trim()) return;
    setFFeatures(prev => [...prev, { label: newFeatureLabel.trim(), included: true }]);
    setNewFeatureLabel("");
  };

  const removeDisplayFeature = (index: number) => { setFFeatures(prev => prev.filter((_, i) => i !== index)); };
  const toggleDisplayFeature = (index: number) => { setFFeatures(prev => prev.map((f, i) => i === index ? { ...f, included: !f.included } : f)); };

  const startEditFeature = (index: number) => { setEditingFeatureIndex(index); setEditingFeatureLabel(fFeatures[index].label); };
  const saveEditFeature = () => {
    if (editingFeatureIndex === null || !editingFeatureLabel.trim()) return;
    setFFeatures(prev => prev.map((f, i) => i === editingFeatureIndex ? { ...f, label: editingFeatureLabel.trim() } : f));
    setEditingFeatureIndex(null); setEditingFeatureLabel("");
  };

  const handlePrecoMensalChange = (value: string) => {
    setFPrecoMensal(value);
    const mensal = parseFloat(value) || 0;
    const desconto = parseFloat(fDescontoAnual) || 0;
    if (mensal > 0 && desconto > 0) setFPrecoAnual((mensal * (1 - desconto / 100)).toFixed(2));
  };

  const handleDescontoAnualChange = (value: string) => {
    const num = Math.min(100, Math.max(0, parseFloat(value) || 0));
    setFDescontoAnual(String(num));
    const mensal = parseFloat(fPrecoMensal) || 0;
    if (mensal > 0) setFPrecoAnual((mensal * (1 - num / 100)).toFixed(2));
  };

  const quickToggleFeature = async (plan: SubscriptionPlan, featureKey: string) => {
    const newFuncs = { ...plan.funcionalidades, [featureKey]: !plan.funcionalidades[featureKey] };
    const { error } = await supabase.from("subscription_plans" as any).update({ funcionalidades: newFuncs } as any).eq("id", plan.id);
    if (error) toast.error("Erro ao atualizar");
    else toast.success(`${featureKey} ${newFuncs[featureKey] ? "ativado" : "desativado"} no plano ${plan.nome}`);
    fetchPlans();
  };

  const enabledCount = (funcs: Record<string, boolean>) => Object.values(funcs || {}).filter(Boolean).length;

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    const reordered = Array.from(plans);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    const updated = reordered.map((p, i) => ({ ...p, ordem: i }));
    setPlans(updated);
    const promises = updated.map(p => supabase.from("subscription_plans" as any).update({ ordem: p.ordem } as any).eq("id", p.id));
    const results = await Promise.all(promises);
    if (results.some(r => r.error)) { toast.error("Erro ao reordenar planos"); fetchPlans(); }
    else toast.success("Ordem dos planos atualizada!");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Gestão de Planos de Assinatura</h3>
          <p className="text-sm text-muted-foreground">Crie e edite planos com funcionalidades granulares. Arraste para reordenar. Alterações refletem em tempo real na landing page.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchPlans} className="gap-2">
            <RefreshCw className="h-3 w-3" /> Atualizar
          </Button>
          <Button size="sm" onClick={openNew} className="gap-2">
            <Plus className="h-3 w-3" /> Novo Plano
          </Button>
        </div>
      </div>

      {/* Plans cards with drag-and-drop */}
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="plans-grid" direction="horizontal">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="grid md:grid-cols-3 gap-4">
              {plans.map((plan, index) => {
                const Icon = ICON_MAP[plan.slug] || Crown;
                return (
                  <Draggable key={plan.id} draggableId={plan.id} index={index}>
                    {(dragProvided, snapshot) => (
                      <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} className={snapshot.isDragging ? "opacity-80 z-50" : ""}>
                        <Card className={`relative ${plan.destaque ? "border-primary shadow-lg" : "border-border"} ${!plan.ativo ? "opacity-60" : ""}`}>
                          <div {...dragProvided.dragHandleProps} className="absolute top-2 right-2 cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted z-10" title="Arraste para reordenar">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                          </div>
                          {plan.destaque && (
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                              <Badge className="gap-1 bg-primary text-primary-foreground"><Star className="h-3 w-3 fill-current" /> Destaque</Badge>
                            </div>
                          )}
                          <CardHeader className="text-center pb-2 pt-6">
                            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                              <Icon className="h-6 w-6 text-primary" />
                            </div>
                            <CardTitle className="text-lg">{plan.nome}</CardTitle>
                            <p className="text-xs text-muted-foreground">{plan.descricao}</p>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="text-center">
                              {plan.preco_mensal === 0 ? (
                                <p className="text-2xl font-bold text-foreground">Grátis</p>
                              ) : (
                                <>
                                  <p className="text-2xl font-bold text-foreground">
                                    R$ {plan.preco_mensal.toFixed(2).replace(".", ",")}
                                    <span className="text-sm font-normal text-muted-foreground">/mês</span>
                                  </p>
                                  <p className="text-xs text-muted-foreground">Anual: R$ {plan.preco_anual_mensal.toFixed(2).replace(".", ",")}/mês</p>
                                </>
                              )}
                            </div>
                            <div className="text-center">
                              <Badge variant="outline" className="text-xs">
                                {plan.max_usuarios >= 999 ? "Usuários ilimitados" : `Até ${plan.max_usuarios} usuários`}
                              </Badge>
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                Funcionalidades ({enabledCount(plan.funcionalidades)}/{ALL_FEATURES.length})
                              </p>
                              <div className="grid grid-cols-2 gap-1">
                                {ALL_FEATURES.slice(0, 10).map(feat => (
                                  <button key={feat.key} onClick={() => quickToggleFeature(plan, feat.key)}
                                    className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors ${
                                      plan.funcionalidades?.[feat.key] ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground line-through"
                                    }`}
                                    title={`Clique para ${plan.funcionalidades?.[feat.key] ? "desativar" : "ativar"} ${feat.label}`}
                                  >
                                    {plan.funcionalidades?.[feat.key] ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
                                    <span className="truncate">{feat.label}</span>
                                  </button>
                                ))}
                              </div>
                              {ALL_FEATURES.length > 10 && (
                                <p className="text-[10px] text-muted-foreground text-center">+{ALL_FEATURES.length - 10} na matriz abaixo</p>
                              )}
                            </div>
                            <div className="flex gap-1.5 pt-2">
                              <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => openEdit(plan)}>
                                <Edit className="h-3 w-3" /> Editar
                              </Button>
                              <Button variant="outline" size="sm" className="gap-1" onClick={() => duplicatePlan(plan)} title="Duplicar plano">
                                <Copy className="h-3 w-3" />
                              </Button>
                              {!["trial", "basico", "premium"].includes(plan.slug) && (
                                <Button variant="outline" size="sm" className="text-destructive gap-1" onClick={() => deletePlan(plan.id, plan.slug)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Feature Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Matriz de Funcionalidades por Plano</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px] sticky left-0 bg-background z-10">Funcionalidade</TableHead>
                  {plans.map(p => (
                    <TableHead key={p.id} className="text-center min-w-[100px]">{p.nome}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ALL_FEATURES.map(feat => (
                  <TableRow key={feat.key}>
                    <TableCell className="sticky left-0 bg-background z-10">
                      <div>
                        <p className="text-sm font-medium text-foreground">{feat.label}</p>
                        <p className="text-xs text-muted-foreground">{feat.description}</p>
                      </div>
                    </TableCell>
                    {plans.map(plan => (
                      <TableCell key={plan.id} className="text-center">
                        <button onClick={() => quickToggleFeature(plan, feat.key)} className="mx-auto block" title="Clique para alternar">
                          {plan.funcionalidades?.[feat.key] ? (
                            <Check className="h-5 w-5 text-primary mx-auto" />
                          ) : (
                            <X className="h-5 w-5 text-muted-foreground/30 mx-auto" />
                          )}
                        </button>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Plan Edit/Create Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {editing ? `Editar Plano: ${editing.nome}` : "Novo Plano"}
              <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={() => setShowPreview(!showPreview)}>
                <Eye className="h-3.5 w-3.5" /> {showPreview ? "Ocultar Preview" : "Preview ao Vivo"}
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className={showPreview ? "grid grid-cols-[1fr_280px] gap-6" : ""}>
            {/* Form */}
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Slug (identificador) *</Label>
                  <Input value={fSlug} onChange={e => setFSlug(e.target.value)} placeholder="ex: enterprise" className="mt-1" disabled={!!editing && ["trial", "basico", "premium"].includes(editing.slug)} />
                </div>
                <div>
                  <Label>Nome *</Label>
                  <Input value={fNome} onChange={e => setFNome(e.target.value)} placeholder="Nome do plano" className="mt-1" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Descrição</Label>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary/10" onClick={generateDescription} disabled={generatingDesc}>
                    {generatingDesc ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {generatingDesc ? "Gerando..." : "Gerar com IA"}
                  </Button>
                </div>
                <Textarea value={fDescricao} onChange={e => setFDescricao(e.target.value)} placeholder="Descrição curta do plano" rows={2} />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <Label>Preço Mensal (R$)</Label>
                  <Input type="number" step="0.01" value={fPrecoMensal} onChange={e => handlePrecoMensalChange(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Desconto Anual (%)</Label>
                  <Input type="number" min="0" max="100" value={fDescontoAnual} onChange={e => handleDescontoAnualChange(e.target.value)} className="mt-1" placeholder="20" />
                </div>
                <div>
                  <Label>Preço Anual/mês (R$)</Label>
                  <Input type="number" step="0.01" value={fPrecoAnual} onChange={e => setFPrecoAnual(e.target.value)} className="mt-1 bg-muted/50" />
                  {parseFloat(fPrecoMensal) > 0 && parseFloat(fPrecoAnual) > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1">Economia: {((1 - parseFloat(fPrecoAnual) / parseFloat(fPrecoMensal)) * 100).toFixed(0)}%</p>
                  )}
                </div>
                <div>
                  <Label>Máx. Usuários</Label>
                  <Input type="number" value={fMaxUsers} onChange={e => setFMaxUsers(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Dias de Trial</Label>
                  <Input type="number" value={fTrialDias} onChange={e => setFTrialDias(e.target.value)} className="mt-1" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Ordem</Label>
                  <Input type="number" value={fOrdem} onChange={e => setFOrdem(e.target.value)} className="mt-1" />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <Switch checked={fDestaque} onCheckedChange={setFDestaque} />
                  <Label>Plano em Destaque</Label>
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <Switch checked={fAtivo} onCheckedChange={setFAtivo} />
                  <Label>Ativo</Label>
                </div>
              </div>

              {/* Feature Toggles */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Funcionalidades do Sistema</Label>
                <p className="text-xs text-muted-foreground">Ative ou desative cada funcionalidade para este plano.</p>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_FEATURES.map(feat => (
                    <div key={feat.key}
                      className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${
                        fFuncionalidades[feat.key] ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{feat.label}</p>
                        <p className="text-xs text-muted-foreground">{feat.description}</p>
                      </div>
                      <Switch checked={fFuncionalidades[feat.key] || false} onCheckedChange={() => toggleFeature(feat.key)} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Display Features (for landing page) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base font-semibold">Lista de Features (Landing Page)</Label>
                    <p className="text-xs text-muted-foreground">Itens exibidos na landing page para este plano.</p>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary/10" onClick={suggestFeatures} disabled={suggestingFeatures}>
                    {suggestingFeatures ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                    {suggestingFeatures ? "Sugerindo..." : "Sugerir Features"}
                  </Button>
                </div>
                <div className="space-y-2">
                  {fFeatures.map((feat, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <button type="button" onClick={() => toggleDisplayFeature(i)} className={`shrink-0 ${feat.included ? "text-primary" : "text-muted-foreground"}`}>
                        {feat.included ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                      </button>
                      {editingFeatureIndex === i ? (
                        <Input value={editingFeatureLabel} onChange={e => setEditingFeatureLabel(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveEditFeature(); } if (e.key === "Escape") setEditingFeatureIndex(null); }}
                          onBlur={saveEditFeature} className="h-7 text-sm flex-1" autoFocus />
                      ) : (
                        <span className={`text-sm flex-1 cursor-pointer hover:underline ${feat.included ? "text-foreground" : "text-muted-foreground line-through"}`} onDoubleClick={() => startEditFeature(i)}>
                          {feat.label}
                        </span>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => startEditFeature(i)}><Edit className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeDisplayFeature(i)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input value={newFeatureLabel} onChange={e => setNewFeatureLabel(e.target.value)} placeholder="Nova feature para exibição..."
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addDisplayFeature())} />
                  <Button variant="outline" size="sm" onClick={addDisplayFeature} className="gap-1 shrink-0"><Plus className="h-3 w-3" /> Adicionar</Button>
                </div>
              </div>
            </div>

            {/* Live Preview Panel */}
            {showPreview && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preview Landing</p>
                  <div className="flex gap-1 bg-muted rounded-full p-0.5">
                    <button onClick={() => setPreviewAnnual(false)} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${!previewAnnual ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Mensal</button>
                    <button onClick={() => setPreviewAnnual(true)} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${previewAnnual ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Anual</button>
                  </div>
                </div>
                <PlanPreview
                  nome={fNome}
                  descricao={fDescricao}
                  preco_mensal={parseFloat(fPrecoMensal) || 0}
                  preco_anual_mensal={parseFloat(fPrecoAnual) || 0}
                  max_usuarios={parseInt(fMaxUsers) || 999}
                  destaque={fDestaque}
                  trial_dias={parseInt(fTrialDias) || 0}
                  features_display={fFeatures}
                  annual={previewAnnual}
                />
                <p className="text-[10px] text-muted-foreground text-center">Este preview reflete exatamente como o card aparecerá na landing page pública.</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={savePlan} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar Plano"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
