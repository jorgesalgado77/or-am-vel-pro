import {useState, useEffect, useCallback} from "react";
import type {AffiliateConfig} from "@/hooks/useLandingConfig";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {Switch} from "@/components/ui/switch";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {Badge} from "@/components/ui/badge";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Save, Loader2, Trash2, Plus, Users, Eye, Filter, Gift} from "lucide-react";
import {supabase} from "@/lib/supabaseClient";
import {toast} from "sonner";
import {format} from "date-fns";
import {TEMPERATURE_CONFIG, type LeadTemperature} from "@/lib/leadTemperature";
import type {LandingConfig} from "@/hooks/useLandingConfig";

interface Lead {
  id: string;
  nome: string;
  area_atuacao: string;
  cargo: string;
  telefone: string;
  email: string;
  status: string;
  created_at: string;
  origem?: string;
  interesse?: string;
  lead_temperature?: string;
  whatsapp_enviado?: boolean;
}

export function AdminLandingPage() {
  const [config, setConfig] = useState<LandingConfig | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [leadTempFilter, setLeadTempFilter] = useState("all");
  const [leadOrigemFilter, setLeadOrigemFilter] = useState("all");

  const filteredLeads = leads.filter((l) => {
    if (leadTempFilter !== "all" && (l.lead_temperature || "morno") !== leadTempFilter) return false;
    if (leadOrigemFilter !== "all" && (l.origem || "site") !== leadOrigemFilter) return false;
    return true;
  });

  const fetchData = useCallback(async () => {
    const [configRes, leadsRes] = await Promise.all([
      supabase.from("landing_page_config").select("*").limit(1).maybeSingle(),
      supabase.from("leads").select("*").order("created_at", { ascending: false }),
    ]);

    if (configRes.data) {
      const d = configRes.data as any;
      setConfig({
        id: d.id,
        hero_title: d.hero_title,
        hero_subtitle: d.hero_subtitle,
        hero_image_url: d.hero_image_url,
        hero_video_url: d.hero_video_url,
        benefits: d.benefits || [],
        carousel_images: d.carousel_images || [],
        how_it_works: d.how_it_works || [],
        proof_text: d.proof_text,
        plans: d.plans || [],
        cta_final_text: d.cta_final_text,
        primary_color: d.primary_color,
        secondary_color: d.secondary_color,
        sections_visible: d.sections_visible || {},
        footer_text: d.footer_text,
        footer_contact_email: d.footer_contact_email,
        footer_contact_phone: d.footer_contact_phone,
        affiliate_config: d.affiliate_config || {
          badge_text: "Programa de Afiliados",
          title_prefix: "Qualquer pessoa pode",
          title_highlight: "Divulgar e Ganhar",
          title_suffix: "com o OrçaMóvel PRO",
          description: "Indique o OrçaMóvel PRO para marcenarias e lojas de móveis planejados e receba 5% de comissão sobre cada nova assinatura. Basta compartilhar seu link exclusivo!",
          steps: [
            { icon: "Share2", title: "Compartilhe", description: "Gere seu link exclusivo em segundos" },
            { icon: "Gift", title: "Indique", description: "Envie para amigos e parceiros do setor" },
            { icon: "DollarSign", title: "Ganhe", description: "Receba 5% de comissão via PIX" },
          ],
          cta_text: "Quero Divulgar e Ganhar",
          cta_subtext: "Cadastro gratuito • Sem limite de indicações • Pagamento via PIX",
          image_url: null,
        },
      });
    }
    if (leadsRes.data) setLeads(leadsRes.data as any);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    const { id, ...rest } = config;
    const { error } = await supabase
      .from("landing_page_config")
      .update({ ...rest, updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar");
    else toast.success("Landing page atualizada!");
  };

  const updateField = <K extends keyof LandingConfig>(key: K, value: LandingConfig[K]) => {
    if (!config) return;
    setConfig({ ...config, [key]: value });
  };

  const toggleSection = (section: string) => {
    if (!config) return;
    setConfig({
      ...config,
      sections_visible: { ...config.sections_visible, [section]: !config.sections_visible[section] },
    });
  };

  if (loading || !config) return <p className="text-center py-8 text-gray-500">Carregando...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Gerenciar Landing Page</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="/site" target="_blank" className="gap-1.5">
              <Eye className="h-4 w-4" /> Visualizar
            </a>
          </Button>
          <Button size="sm" onClick={saveConfig} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Alterações
          </Button>
        </div>
      </div>

      <Tabs defaultValue="geral">
        <TabsList className="grid grid-cols-6 w-full max-w-2xl">
          <TabsTrigger value="geral">Geral</TabsTrigger>
          <TabsTrigger value="conteudo">Conteúdo</TabsTrigger>
          <TabsTrigger value="planos">Planos</TabsTrigger>
          <TabsTrigger value="imagens">Imagens</TabsTrigger>
          <TabsTrigger value="afiliados" className="gap-1"><Gift className="h-3 w-3" />Afiliados</TabsTrigger>
          <TabsTrigger value="leads">Leads ({leads.length})</TabsTrigger>
        </TabsList>

        {/* GERAL */}
        <TabsContent value="geral" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Cores e Aparência</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cor Primária</Label>
                  <div className="flex gap-2 mt-1">
                    <Input type="color" value={config.primary_color} onChange={(e) => updateField("primary_color", e.target.value)} className="w-12 h-10 p-1" />
                    <Input value={config.primary_color} onChange={(e) => updateField("primary_color", e.target.value)} className="flex-1" />
                  </div>
                </div>
                <div>
                  <Label>Cor Secundária</Label>
                  <div className="flex gap-2 mt-1">
                    <Input type="color" value={config.secondary_color} onChange={(e) => updateField("secondary_color", e.target.value)} className="w-12 h-10 p-1" />
                    <Input value={config.secondary_color} onChange={(e) => updateField("secondary_color", e.target.value)} className="flex-1" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Seções Visíveis</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: "hero", label: "Hero (Banner Principal)" },
                { key: "benefits", label: "Benefícios" },
                { key: "carousel", label: "Carrossel de Imagens" },
                { key: "how_it_works", label: "Como Funciona" },
                { key: "proof", label: "Prova Social / Desejo" },
                { key: "plans", label: "Planos" },
                { key: "lead_form", label: "Formulário de Captação" },
                { key: "cta_final", label: "CTA Final" },
                { key: "affiliate", label: "Divulgue e Ganhe (Afiliados)" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <Label>{label}</Label>
                  <Switch checked={!!config.sections_visible[key]} onCheckedChange={() => toggleSection(key)} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Footer</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><Label>Texto do Rodapé</Label><Input value={config.footer_text} onChange={(e) => updateField("footer_text", e.target.value)} className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Email de Contato</Label><Input value={config.footer_contact_email || ""} onChange={(e) => updateField("footer_contact_email", e.target.value)} className="mt-1" /></div>
                <div><Label>Telefone de Contato</Label><Input value={config.footer_contact_phone || ""} onChange={(e) => updateField("footer_contact_phone", e.target.value)} className="mt-1" /></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CONTEÚDO */}
        <TabsContent value="conteudo" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Hero</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><Label>Título Principal</Label><Input value={config.hero_title} onChange={(e) => updateField("hero_title", e.target.value)} className="mt-1" /></div>
              <div><Label>Subtítulo</Label><Textarea value={config.hero_subtitle} onChange={(e) => updateField("hero_subtitle", e.target.value)} className="mt-1" rows={3} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>URL da Imagem Hero</Label><Input value={config.hero_image_url || ""} onChange={(e) => updateField("hero_image_url", e.target.value || null)} className="mt-1" placeholder="https://..." /></div>
                <div><Label>URL do Vídeo Hero</Label><Input value={config.hero_video_url || ""} onChange={(e) => updateField("hero_video_url", e.target.value || null)} className="mt-1" placeholder="https://..." /></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Texto de Prova / Desejo</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={config.proof_text} onChange={(e) => updateField("proof_text", e.target.value)} rows={3} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">CTA Final</CardTitle></CardHeader>
            <CardContent>
              <Input value={config.cta_final_text} onChange={(e) => updateField("cta_final_text", e.target.value)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Benefícios</CardTitle>
                <Button size="sm" variant="outline" onClick={() => updateField("benefits", [...config.benefits, { icon: "Calculator", title: "Novo benefício", description: "Descrição" }])}>
                  <Plus className="h-3 w-3 mr-1" />Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {config.benefits.map((b, i) => (
                <div key={i} className="flex gap-2 items-start border rounded-lg p-3">
                  <div className="flex-1 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={b.icon} onChange={(e) => {
                        const nb = [...config.benefits]; nb[i] = { ...nb[i], icon: e.target.value }; updateField("benefits", nb);
                      }} placeholder="Ícone" />
                      <Input value={b.title} onChange={(e) => {
                        const nb = [...config.benefits]; nb[i] = { ...nb[i], title: e.target.value }; updateField("benefits", nb);
                      }} placeholder="Título" />
                    </div>
                    <Input value={b.description} onChange={(e) => {
                      const nb = [...config.benefits]; nb[i] = { ...nb[i], description: e.target.value }; updateField("benefits", nb);
                    }} placeholder="Descrição" />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => updateField("benefits", config.benefits.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Como Funciona</CardTitle>
                <Button size="sm" variant="outline" onClick={() => updateField("how_it_works", [...config.how_it_works, { step: config.how_it_works.length + 1, title: "Novo passo", description: "Descrição" }])}>
                  <Plus className="h-3 w-3 mr-1" />Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {config.how_it_works.map((s, i) => (
                <div key={i} className="flex gap-2 items-start border rounded-lg p-3">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <Input type="number" value={s.step} onChange={(e) => {
                      const ns = [...config.how_it_works]; ns[i] = { ...ns[i], step: Number(e.target.value) }; updateField("how_it_works", ns);
                    }} />
                    <Input value={s.title} onChange={(e) => {
                      const ns = [...config.how_it_works]; ns[i] = { ...ns[i], title: e.target.value }; updateField("how_it_works", ns);
                    }} placeholder="Título" />
                    <Input value={s.description} onChange={(e) => {
                      const ns = [...config.how_it_works]; ns[i] = { ...ns[i], description: e.target.value }; updateField("how_it_works", ns);
                    }} placeholder="Descrição" />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => updateField("how_it_works", config.how_it_works.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PLANOS */}
        <TabsContent value="planos" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Planos de Assinatura</CardTitle>
                <Button size="sm" variant="outline" onClick={() => updateField("plans", [...config.plans, { name: "Novo Plano", price_monthly: 0, price_yearly: 0, max_users: 5, features: ["Recurso 1"], recommended: false }])}>
                  <Plus className="h-3 w-3 mr-1" />Adicionar Plano
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {config.plans.map((plan, i) => (
                <div key={i} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">{plan.name}</h4>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Recomendado</Label>
                      <Switch checked={plan.recommended} onCheckedChange={(v) => {
                        const np = [...config.plans]; np[i] = { ...np[i], recommended: v }; updateField("plans", np);
                      }} />
                      <Button variant="ghost" size="sm" onClick={() => updateField("plans", config.plans.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div><Label className="text-xs">Nome</Label><Input value={plan.name} onChange={(e) => {
                      const np = [...config.plans]; np[i] = { ...np[i], name: e.target.value }; updateField("plans", np);
                    }} className="mt-1" /></div>
                    <div><Label className="text-xs">Preço Mensal</Label><Input type="number" value={plan.price_monthly} onChange={(e) => {
                      const np = [...config.plans]; np[i] = { ...np[i], price_monthly: Number(e.target.value) }; updateField("plans", np);
                    }} className="mt-1" /></div>
                    <div><Label className="text-xs">Preço Anual</Label><Input type="number" value={plan.price_yearly} onChange={(e) => {
                      const np = [...config.plans]; np[i] = { ...np[i], price_yearly: Number(e.target.value) }; updateField("plans", np);
                    }} className="mt-1" /></div>
                    <div><Label className="text-xs">Máx. Usuários</Label><Input type="number" value={plan.max_users} onChange={(e) => {
                      const np = [...config.plans]; np[i] = { ...np[i], max_users: Number(e.target.value) }; updateField("plans", np);
                    }} className="mt-1" /></div>
                  </div>
                  <div>
                    <Label className="text-xs">Funcionalidades (uma por linha)</Label>
                    <Textarea
                      value={plan.features.join("\n")}
                      onChange={(e) => {
                        const np = [...config.plans];
                        np[i] = { ...np[i], features: e.target.value.split("\n").filter(Boolean) };
                        updateField("plans", np);
                      }}
                      rows={4}
                      className="mt-1 text-sm"
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* IMAGENS */}
        <TabsContent value="imagens" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Imagens do Carrossel</CardTitle>
                <Button size="sm" variant="outline" onClick={() => updateField("carousel_images", [...config.carousel_images, ""])}>
                  <Plus className="h-3 w-3 mr-1" />Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {config.carousel_images.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Sem URLs extras cadastradas. O carrossel usará automaticamente as screenshots reais locais do sistema.</p>
              )}
              {config.carousel_images.map((url, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    value={url}
                    onChange={(e) => {
                      const nc = [...config.carousel_images]; nc[i] = e.target.value; updateField("carousel_images", nc);
                    }}
                    placeholder="URL da imagem"
                    className="flex-1"
                  />
                  {url && (
                    <div className="h-10 w-16 rounded border overflow-hidden shrink-0">
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </div>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => updateField("carousel_images", config.carousel_images.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AFILIADOS */}
        <TabsContent value="afiliados" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Textos da Seção "Divulgue e Ganhe"</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Texto do Badge</Label>
                <Input value={config.affiliate_config.badge_text} onChange={(e) => updateField("affiliate_config", { ...config.affiliate_config, badge_text: e.target.value })} className="mt-1" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Título (prefixo)</Label>
                  <Input value={config.affiliate_config.title_prefix} onChange={(e) => updateField("affiliate_config", { ...config.affiliate_config, title_prefix: e.target.value })} className="mt-1" placeholder="Qualquer pessoa pode" />
                </div>
                <div>
                  <Label>Título (destaque colorido)</Label>
                  <Input value={config.affiliate_config.title_highlight} onChange={(e) => updateField("affiliate_config", { ...config.affiliate_config, title_highlight: e.target.value })} className="mt-1" placeholder="Divulgar e Ganhar" />
                </div>
                <div>
                  <Label>Título (sufixo)</Label>
                  <Input value={config.affiliate_config.title_suffix} onChange={(e) => updateField("affiliate_config", { ...config.affiliate_config, title_suffix: e.target.value })} className="mt-1" placeholder="com o OrçaMóvel PRO" />
                </div>
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea value={config.affiliate_config.description} onChange={(e) => updateField("affiliate_config", { ...config.affiliate_config, description: e.target.value })} className="mt-1" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Texto do Botão CTA</Label>
                  <Input value={config.affiliate_config.cta_text} onChange={(e) => updateField("affiliate_config", { ...config.affiliate_config, cta_text: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Subtexto abaixo do CTA</Label>
                  <Input value={config.affiliate_config.cta_subtext} onChange={(e) => updateField("affiliate_config", { ...config.affiliate_config, cta_subtext: e.target.value })} className="mt-1" />
                </div>
              </div>
              <div>
                <Label>URL da Imagem (deixe vazio para usar a padrão)</Label>
                <Input value={config.affiliate_config.image_url || ""} onChange={(e) => updateField("affiliate_config", { ...config.affiliate_config, image_url: e.target.value || null })} className="mt-1" placeholder="https://..." />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Cards de Passos</CardTitle>
                <Button size="sm" variant="outline" onClick={() => updateField("affiliate_config", { ...config.affiliate_config, steps: [...config.affiliate_config.steps, { icon: "Gift", title: "Novo passo", description: "Descrição" }] })}>
                  <Plus className="h-3 w-3 mr-1" />Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {config.affiliate_config.steps.map((step, i) => (
                <div key={i} className="flex gap-2 items-start border rounded-lg p-3">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Ícone</Label>
                      <Select value={step.icon} onValueChange={(v) => {
                        const ns = [...config.affiliate_config.steps]; ns[i] = { ...ns[i], icon: v };
                        updateField("affiliate_config", { ...config.affiliate_config, steps: ns });
                      }}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Share2">Compartilhar</SelectItem>
                          <SelectItem value="Gift">Presente</SelectItem>
                          <SelectItem value="DollarSign">Dinheiro</SelectItem>
                          <SelectItem value="Users">Pessoas</SelectItem>
                          <SelectItem value="Star">Estrela</SelectItem>
                          <SelectItem value="Heart">Coração</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Título</Label>
                      <Input value={step.title} onChange={(e) => {
                        const ns = [...config.affiliate_config.steps]; ns[i] = { ...ns[i], title: e.target.value };
                        updateField("affiliate_config", { ...config.affiliate_config, steps: ns });
                      }} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Descrição</Label>
                      <Input value={step.description} onChange={(e) => {
                        const ns = [...config.affiliate_config.steps]; ns[i] = { ...ns[i], description: e.target.value };
                        updateField("affiliate_config", { ...config.affiliate_config, steps: ns });
                      }} className="mt-1" />
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => updateField("affiliate_config", { ...config.affiliate_config, steps: config.affiliate_config.steps.filter((_, j) => j !== i) })}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* LEADS */}
        <TabsContent value="leads">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Leads Captados ({leads.length})
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select value={leadTempFilter} onValueChange={setLeadTempFilter}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="Temperatura" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="quente">🔥 Quente</SelectItem>
                      <SelectItem value="morno">🟡 Morno</SelectItem>
                      <SelectItem value="frio">❄️ Frio</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={leadOrigemFilter} onValueChange={setLeadOrigemFilter}>
                    <SelectTrigger className="w-[130px] h-8 text-xs">
                      <SelectValue placeholder="Origem" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="site">Site</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="api">API</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredLeads.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum lead encontrado.</p>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Temp.</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Interesse</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>WhatsApp</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLeads.map((lead) => {
                        const temp = (lead.lead_temperature || "morno") as LeadTemperature;
                        const tempCfg = TEMPERATURE_CONFIG[temp] || TEMPERATURE_CONFIG.morno;
                        return (
                          <TableRow key={lead.id}>
                            <TableCell>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${tempCfg.bgColor} ${tempCfg.color}`}>
                                {tempCfg.emoji} {tempCfg.label}
                              </span>
                            </TableCell>
                            <TableCell className="font-medium">{lead.nome}</TableCell>
                            <TableCell>{lead.email}</TableCell>
                            <TableCell>{lead.telefone}</TableCell>
                            <TableCell className="text-xs">{lead.interesse || "-"}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{lead.origem || "site"}</Badge></TableCell>
                            <TableCell><Badge variant="secondary">{lead.status}</Badge></TableCell>
                            <TableCell>{lead.whatsapp_enviado ? "✅" : "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{format(new Date(lead.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
