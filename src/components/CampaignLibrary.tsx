import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Copy, CheckCircle2, Lightbulb, Target, MessageSquare, ChevronDown, ChevronUp, Pencil, Save, X, Plus, HelpCircle, Image, Bot, CalendarDays, Library, CopyPlus } from "lucide-react";
import { toast } from "sonner";
import { CampaignImageGenerator } from "@/components/campaigns/CampaignImageGenerator";
import { CampaignAIGenerator } from "@/components/campaigns/CampaignAIGenerator";
import { CampaignScheduler } from "@/components/campaigns/CampaignScheduler";
import { SEASONAL_CAMPAIGNS, type Campaign } from "@/components/campaigns/SeasonalCampaigns";

const BASE_CAMPAIGNS: Campaign[] = [
  {
    id: "coz-1", titulo: "Cozinha dos Sonhos — Projeto Grátis", categoria: "cozinha", plataforma: "facebook",
    headline: "🍳 Sua Cozinha Planejada com Projeto 3D GRÁTIS",
    copy: `Está pensando em renovar sua cozinha? Nós temos a solução perfeita!\n\n✅ Projeto 3D gratuito e sem compromisso\n✅ Materiais de alta qualidade\n✅ Parcelamento em até 60x\n✅ Entrega e montagem inclusa\n\n📲 Clique no botão abaixo e solicite seu projeto agora!\n\n⚡ Vagas limitadas este mês.`,
    cta: "Quero Meu Projeto Grátis",
    instrucoes: ["Crie um anúncio no Facebook Ads com objetivo 'Geração de Cadastros'", "Use imagens de cozinhas planejadas bonitas (fotos reais são melhores)", "Segmente por: idade 25-55, interesse em decoração/móveis/reforma", "Orçamento sugerido: R$ 20-30/dia", "Link de destino: sua landing page do funil de captação"],
    hashtags: ["#CozinhaPlanejada", "#Projeto3DGratis", "#MoveisplanejadosPromo"],
  },
  {
    id: "coz-2", titulo: "Antes e Depois — Cozinha Transformada", categoria: "cozinha", plataforma: "instagram",
    headline: "De antiga para INCRÍVEL! 🔥 Veja a transformação",
    copy: `Olha só o que fizemos com essa cozinha! 😍\n\nDe um espaço sem graça para uma cozinha dos sonhos.\n\n💡 E o melhor: o Projeto 3D é GRATUITO!\n\nQuer ver como ficaria a SUA cozinha?\n\n👉 Toque em "Saiba Mais" e peça seu projeto sem compromisso!`,
    cta: "Saiba Mais",
    instrucoes: ["Use formato Carrossel com 3-5 imagens de antes e depois", "Stories também funciona muito bem para esse formato", "Público: mulheres 28-50, interesses: decoração, Pinterest, Casa", "Orçamento sugerido: R$ 15-25/dia", "Inclua o link da sua landing page na bio ou no CTA"],
  },
  {
    id: "qrt-1", titulo: "Quarto Planejado — Organize sua Vida", categoria: "quarto", plataforma: "facebook",
    headline: "🛏️ Seu Quarto Planejado com Projeto 3D GRÁTIS",
    copy: `Chega de bagunça! Transforme seu quarto em um espaço organizado e elegante.\n\n✅ Armários sob medida\n✅ Projeto 3D gratuito\n✅ Aproveitamento total do espaço\n✅ Parcelas que cabem no bolso\n\n📲 Solicite agora seu projeto e veja a mágica acontecer!\n\n⏰ Promoção por tempo limitado.`,
    cta: "Quero Meu Projeto Grátis",
    instrucoes: ["Objetivo da campanha: Geração de Cadastros ou Mensagens no WhatsApp", "Fotos de quartos planejados com boa iluminação", "Público: casais 25-45, recém-casados, quem acabou de mudar", "Orçamento sugerido: R$ 20-30/dia", "Use depoimentos de clientes satisfeitos quando possível"],
    hashtags: ["#QuartoPlanejado", "#MoveissobMedida", "#OrganizaçãoTotal"],
  },
  {
    id: "qrt-2", titulo: "Closet dos Sonhos — Instagram Reels", categoria: "quarto", plataforma: "instagram",
    headline: "Seu closet dos sonhos está a um clique de distância ✨",
    copy: `Imagina ter TUDO organizado no seu closet! 👗👔\n\nNós projetamos sob medida pra você.\n\n🎨 Projeto 3D GRÁTIS\n📏 100% sob medida\n💰 Condições especiais este mês\n\n👉 Link na bio para solicitar!`,
    cta: "Link na Bio",
    instrucoes: ["Grave um vídeo curto (15-30s) mostrando um closet planejado", "Use música trending no Reels para mais alcance", "Formato vertical (9:16)", "Público: mulheres 25-45, interesse em moda e organização", "Orçamento: R$ 10-20/dia em impulsionamento"],
  },
  {
    id: "plan-1", titulo: "Móveis Planejados — Campanha Completa", categoria: "planejados", plataforma: "facebook",
    headline: "🏠 Móveis Planejados com Projeto 3D GRATUITO",
    copy: `Transforme sua casa com móveis sob medida!\n\n🔹 Cozinha | Quarto | Sala | Banheiro | Escritório\n\n✅ Projeto 3D gratuito e sem compromisso\n✅ Materiais premium com garantia\n✅ Parcelamos em até 60x sem juros*\n✅ Entrega e montagem profissional\n\n📞 Fale com um especialista agora!\n\n*Consulte condições`,
    cta: "Falar com Especialista",
    instrucoes: ["Campanha institucional — use para captar leads de todos os ambientes", "Formato: imagem única ou carrossel com 1 foto de cada ambiente", "Público amplo: 25-55 anos, interesse em decoração e reforma", "Orçamento sugerido: R$ 30-50/dia", "Direcione para o WhatsApp ou landing page do funil"],
    hashtags: ["#MoveisplanejadoS", "#SobMedida", "#Projeto3DGratis"],
  },
  {
    id: "plan-2", titulo: "Promoção Relâmpago — Todos os Ambientes", categoria: "planejados", plataforma: "instagram",
    headline: "⚡ PROMOÇÃO RELÂMPAGO: Até 20% OFF + Projeto 3D Grátis",
    copy: `🚨 SÓ ESTA SEMANA! 🚨\n\nAté 20% de desconto em TODOS os ambientes planejados!\n\n🔥 Cozinha\n🔥 Quarto\n🔥 Sala de Estar\n🔥 Home Office\n🔥 Banheiro\n\nE ainda ganha o Projeto 3D de PRESENTE! 🎁\n\n⏰ Válido até domingo. Corra!\n\n👉 Toque em "Saiba Mais" e garanta!`,
    cta: "Saiba Mais",
    instrucoes: ["Use Stories + Feed + Reels para máximo alcance", "Crie senso de urgência com contagem regressiva nos Stories", "Público: remarketing (quem visitou site/perfil) + lookalike", "Orçamento: R$ 40-60/dia durante a promoção", "Landing page com timer de contagem regressiva"],
  },
  {
    id: "plan-3", titulo: "Google Ads — Busca por Planejados", categoria: "planejados", plataforma: "google",
    headline: "Móveis Planejados | Projeto 3D Grátis | Parcele em 60x",
    copy: `Móveis planejados sob medida para sua casa. Projeto 3D gratuito e sem compromisso. Materiais premium com garantia. Solicite um orçamento agora!`,
    cta: "Solicitar Orçamento",
    instrucoes: ["Crie uma campanha de Pesquisa no Google Ads", "Palavras-chave: 'móveis planejados', 'cozinha planejada', 'armário sob medida', 'móveis planejados [sua cidade]'", "Use extensões de anúncio: local, telefone, sitelinks", "Orçamento: R$ 30-50/dia", "Landing page: sua página do funil de captação", "Negative keywords: 'grátis', 'usado', 'barato demais'"],
  },
];

const INITIAL_CAMPAIGNS = [...BASE_CAMPAIGNS, ...SEASONAL_CAMPAIGNS];

const CATEGORY_LABELS: Record<string, string> = {
  cozinha: "Cozinha",
  quarto: "Quarto",
  planejados: "Planejados Geral",
  datas: "Datas Comemorativas",
  manual: "Minhas Campanhas",
};

const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  facebook: { label: "Facebook", color: "bg-blue-500/10 text-blue-700 border-blue-200" },
  instagram: { label: "Instagram", color: "bg-pink-500/10 text-pink-700 border-pink-200" },
  google: { label: "Google Ads", color: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
};

function CampaignCard({ campaign, onUpdate }: { campaign: Campaign; onUpdate?: (c: Campaign) => void }) {
  const [showInstrucoes, setShowInstrucoes] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ headline: campaign.headline, copy: campaign.copy, cta: campaign.cta });

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copiado!`);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyFullCampaign = () => {
    const c = editing ? editData : campaign;
    const full = `TÍTULO: ${c.headline}\n\nCOPY:\n${c.copy}\n\nCTA: ${c.cta}${campaign.hashtags ? `\n\nHASHTAGS: ${campaign.hashtags.join(" ")}` : ""}`;
    copyText(full, "Campanha completa");
  };

  const saveEdit = () => {
    onUpdate?.({ ...campaign, headline: editData.headline, copy: editData.copy, cta: editData.cta });
    setEditing(false);
    toast.success("Campanha atualizada!");
  };

  const cancelEdit = () => {
    setEditData({ headline: campaign.headline, copy: campaign.copy, cta: campaign.cta });
    setEditing(false);
  };

  const plat = PLATFORM_CONFIG[campaign.plataforma];
  const displayHeadline = editing ? editData.headline : campaign.headline;
  const displayCopy = editing ? editData.copy : campaign.copy;
  const displayCta = editing ? editData.cta : campaign.cta;

  return (
    <Card className="group hover:shadow-lg transition-shadow duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1">
            <CardTitle className="text-base leading-snug">{campaign.titulo}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={plat.color}>{plat.label}</Badge>
              <Badge variant="secondary" className="text-xs">{CATEGORY_LABELS[campaign.categoria] || campaign.categoria}</Badge>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => editing ? cancelEdit() : setEditing(true)}>
            {editing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Target className="h-3 w-3" /> Headline</span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => copyText(displayHeadline, "Headline")}>
              {copied === "Headline" ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />} Copiar
            </Button>
          </div>
          {editing ? (
            <Input value={editData.headline} onChange={e => setEditData(p => ({ ...p, headline: e.target.value }))} className="h-8 text-sm" />
          ) : (
            <p className="text-sm font-medium bg-muted/50 rounded-lg px-3 py-2">{displayHeadline}</p>
          )}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Copy do Anúncio</span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => copyText(displayCopy, "Copy")}>
              {copied === "Copy" ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />} Copiar
            </Button>
          </div>
          {editing ? (
            <Textarea value={editData.copy} onChange={e => setEditData(p => ({ ...p, copy: e.target.value }))} rows={6} className="text-sm" />
          ) : (
            <pre className="text-sm whitespace-pre-wrap bg-muted/50 rounded-lg px-3 py-2 font-sans leading-relaxed max-h-48 overflow-y-auto">{displayCopy}</pre>
          )}
        </div>

        <div className="flex items-center justify-between bg-primary/5 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 cursor-help">
                    CTA: <HelpCircle className="h-3 w-3 text-muted-foreground" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px]">
                  <p className="text-xs"><strong>Call to Action</strong> — É o botão ou frase que convida o cliente a agir (ex: "Quero meu projeto", "Saiba mais"). Quanto mais direto, melhor a conversão.</p>
                </TooltipContent>
              </Tooltip>
              {editing ? (
                <Input value={editData.cta} onChange={e => setEditData(p => ({ ...p, cta: e.target.value }))} className="h-7 text-sm inline w-40 ml-1" />
              ) : (
                <span className="text-primary">{displayCta}</span>
              )}
            </span>
          </div>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => copyText(displayCta, "CTA")}>
            {copied === "CTA" ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>

        {campaign.hashtags && (
          <div className="flex flex-wrap gap-1.5">
            {campaign.hashtags.map(h => (
              <Badge key={h} variant="outline" className="text-xs cursor-pointer hover:bg-primary/10 transition-colors" onClick={() => copyText(h, h)}>{h}</Badge>
            ))}
          </div>
        )}

        {editing && (
          <Button onClick={saveEdit} className="w-full gap-2" variant="default">
            <Save className="h-4 w-4" /> Salvar Alterações
          </Button>
        )}

        <div>
          <Button variant="ghost" size="sm" className="w-full justify-between text-xs font-medium text-muted-foreground h-8" onClick={() => setShowInstrucoes(!showInstrucoes)}>
            <span className="flex items-center gap-1"><Lightbulb className="h-3.5 w-3.5" /> Como ativar esta campanha</span>
            {showInstrucoes ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
          {showInstrucoes && (
            <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground pl-1">
              {campaign.instrucoes.map((inst, i) => (
                <li key={i} className="flex gap-2">
                  <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">{i + 1}</span>
                  <span className="leading-snug pt-0.5">{inst}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {!editing && (
          <Button onClick={copyFullCampaign} className="w-full gap-2" variant={copied === "Campanha completa" ? "secondary" : "default"}>
            {copied === "Campanha completa" ? <><CheckCircle2 className="h-4 w-4 text-green-500" /> Copiado!</> : <><Copy className="h-4 w-4" /> Copiar Campanha Completa</>}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function CampaignLibrary() {
  const categories = ["todos", "cozinha", "quarto", "planejados", "datas", "manual"];
  const [campaigns, setCampaigns] = useState<Campaign[]>(INITIAL_CAMPAIGNS);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ titulo: "", headline: "", copy: "", cta: "", plataforma: "facebook", categoria: "manual" });

  const updateCampaign = (updated: Campaign) => {
    setCampaigns(prev => prev.map(c => c.id === updated.id ? updated : c));
  };

  const createCampaign = () => {
    if (!newCampaign.titulo || !newCampaign.headline || !newCampaign.copy) {
      toast.error("Preencha título, headline e copy.");
      return;
    }
    const c: Campaign = {
      id: `manual-${Date.now()}`,
      titulo: newCampaign.titulo,
      headline: newCampaign.headline,
      copy: newCampaign.copy,
      cta: newCampaign.cta || "Saiba Mais",
      plataforma: newCampaign.plataforma as Campaign["plataforma"],
      categoria: "manual" as any,
      instrucoes: ["Personalize conforme sua necessidade"],
    };
    setCampaigns(prev => [c, ...prev]);
    setNewCampaign({ titulo: "", headline: "", copy: "", cta: "", plataforma: "facebook", categoria: "manual" });
    setShowNewDialog(false);
    toast.success("Campanha criada!");
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <Tabs defaultValue="campanhas">
        <TabsList className="h-auto gap-1 flex-wrap">
          <TabsTrigger value="campanhas" className="gap-1.5 data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-700">
            <Library className="h-3.5 w-3.5" /> Campanhas Prontas
          </TabsTrigger>
          <TabsTrigger value="imagens" className="gap-1.5 data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-700">
            <Image className="h-3.5 w-3.5" /> Gerador de Imagens
          </TabsTrigger>
          <TabsTrigger value="ia" className="gap-1.5 data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-700">
            <Bot className="h-3.5 w-3.5" /> Criar com IA
          </TabsTrigger>
          <TabsTrigger value="agenda" className="gap-1.5 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-700">
            <CalendarDays className="h-3.5 w-3.5" /> Agendamento
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campanhas" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <CardDescription className="text-base">
              Campanhas prontas para Facebook, Instagram e Google Ads. Copie, edite e ative em minutos.
            </CardDescription>
            <Button onClick={() => setShowNewDialog(true)} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" /> Nova Campanha
            </Button>
          </div>

          <Tabs defaultValue="todos">
            <TabsList className="h-auto gap-1 flex-wrap">
              {categories.map(cat => (
                <TabsTrigger key={cat} value={cat} className="capitalize">
                  {cat === "todos" ? "Todas" : CATEGORY_LABELS[cat] || cat}
                </TabsTrigger>
              ))}
            </TabsList>

            {categories.map(cat => (
              <TabsContent key={cat} value={cat} className="mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {campaigns.filter(c => cat === "todos" || c.categoria === cat).map(campaign => (
                    <CampaignCard key={campaign.id} campaign={campaign} onUpdate={updateCampaign} />
                  ))}
                  {cat === "manual" && campaigns.filter(c => c.categoria === "manual").length === 0 && (
                    <p className="text-sm text-muted-foreground col-span-2 text-center py-8">Nenhuma campanha manual criada ainda. Clique em "Nova Campanha" para começar.</p>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </TabsContent>

        <TabsContent value="imagens" className="mt-4">
          <CampaignImageGenerator />
        </TabsContent>

        <TabsContent value="ia" className="mt-4">
          <CampaignAIGenerator />
        </TabsContent>

        <TabsContent value="agenda" className="mt-4">
          <CampaignScheduler />
        </TabsContent>
      </Tabs>

      {/* New Campaign Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Criar Nova Campanha</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Título da Campanha *</Label>
              <Input value={newCampaign.titulo} onChange={e => setNewCampaign(p => ({ ...p, titulo: e.target.value }))} placeholder="Ex: Promoção de Verão" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Headline *</Label>
              <Input value={newCampaign.headline} onChange={e => setNewCampaign(p => ({ ...p, headline: e.target.value }))} placeholder="Ex: 🔥 Até 30% OFF em Planejados" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Copy do Anúncio *</Label>
              <Textarea value={newCampaign.copy} onChange={e => setNewCampaign(p => ({ ...p, copy: e.target.value }))} rows={5} placeholder="Texto do anúncio..." className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs flex items-center gap-1">
                  CTA
                  <Tooltip>
                    <TooltipTrigger><HelpCircle className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                    <TooltipContent><p className="text-xs max-w-[200px]"><strong>Call to Action</strong> — O botão que convida o cliente a agir.</p></TooltipContent>
                  </Tooltip>
                </Label>
                <Input value={newCampaign.cta} onChange={e => setNewCampaign(p => ({ ...p, cta: e.target.value }))} placeholder="Ex: Saiba Mais" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Plataforma</Label>
                <select value={newCampaign.plataforma} onChange={e => setNewCampaign(p => ({ ...p, plataforma: e.target.value }))}
                  className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="google">Google Ads</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>Cancelar</Button>
            <Button onClick={createCampaign} className="gap-2"><Plus className="h-4 w-4" /> Criar Campanha</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
