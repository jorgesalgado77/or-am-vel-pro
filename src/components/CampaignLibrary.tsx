import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, CheckCircle2, Lightbulb, Target, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
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

const ALL_CAMPAIGNS = [...BASE_CAMPAIGNS, ...SEASONAL_CAMPAIGNS];

const CATEGORY_LABELS: Record<string, string> = {
  cozinha: "Cozinha",
  quarto: "Quarto",
  planejados: "Planejados Geral",
  datas: "Datas Comemorativas",
};

const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  facebook: { label: "Facebook", color: "bg-blue-500/10 text-blue-700 border-blue-200" },
  instagram: { label: "Instagram", color: "bg-pink-500/10 text-pink-700 border-pink-200" },
  google: { label: "Google Ads", color: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
};

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const [showInstrucoes, setShowInstrucoes] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copiado!`);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyFullCampaign = () => {
    const full = `TÍTULO: ${campaign.headline}\n\nCOPY:\n${campaign.copy}\n\nCTA: ${campaign.cta}${campaign.hashtags ? `\n\nHASHTAGS: ${campaign.hashtags.join(" ")}` : ""}`;
    copyText(full, "Campanha completa");
  };

  const plat = PLATFORM_CONFIG[campaign.plataforma];

  return (
    <Card className="group hover:shadow-lg transition-shadow duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1">
            <CardTitle className="text-base leading-snug">{campaign.titulo}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={plat.color}>{plat.label}</Badge>
              <Badge variant="secondary" className="text-xs">{CATEGORY_LABELS[campaign.categoria]}</Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Target className="h-3 w-3" /> Headline</span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => copyText(campaign.headline, "Headline")}>
              {copied === "Headline" ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />} Copiar
            </Button>
          </div>
          <p className="text-sm font-medium bg-muted/50 rounded-lg px-3 py-2">{campaign.headline}</p>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Copy do Anúncio</span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => copyText(campaign.copy, "Copy")}>
              {copied === "Copy" ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />} Copiar
            </Button>
          </div>
          <pre className="text-sm whitespace-pre-wrap bg-muted/50 rounded-lg px-3 py-2 font-sans leading-relaxed max-h-48 overflow-y-auto">{campaign.copy}</pre>
        </div>

        <div className="flex items-center justify-between bg-primary/5 rounded-lg px-3 py-2">
          <span className="text-sm font-medium">CTA: <span className="text-primary">{campaign.cta}</span></span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => copyText(campaign.cta, "CTA")}>
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

        <Button onClick={copyFullCampaign} className="w-full gap-2" variant={copied === "Campanha completa" ? "secondary" : "default"}>
          {copied === "Campanha completa" ? <><CheckCircle2 className="h-4 w-4 text-green-500" /> Copiado!</> : <><Copy className="h-4 w-4" /> Copiar Campanha Completa</>}
        </Button>
      </CardContent>
    </Card>
  );
}

export function CampaignLibrary() {
  const categories = ["todos", "cozinha", "quarto", "planejados", "datas"];

  return (
    <div className="space-y-6 max-w-5xl">
      <Tabs defaultValue="campanhas">
        <TabsList className="h-auto gap-1">
          <TabsTrigger value="campanhas">📋 Campanhas Prontas</TabsTrigger>
          <TabsTrigger value="imagens">🖼️ Gerador de Imagens</TabsTrigger>
          <TabsTrigger value="ia">🤖 Criar com IA</TabsTrigger>
        </TabsList>

        <TabsContent value="campanhas" className="mt-4 space-y-4">
          <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="px-0 pt-0">
              <CardDescription className="text-base">
                Campanhas prontas para Facebook, Instagram e Google Ads. Copie o texto, adicione suas fotos e ative em minutos.
              </CardDescription>
            </CardHeader>
          </Card>

          <Tabs defaultValue="todos">
            <TabsList className="h-auto gap-1 flex-wrap">
              {categories.map(cat => (
                <TabsTrigger key={cat} value={cat} className="capitalize">
                  {cat === "todos" ? "Todas" : CATEGORY_LABELS[cat]}
                </TabsTrigger>
              ))}
            </TabsList>

            {categories.map(cat => (
              <TabsContent key={cat} value={cat} className="mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {ALL_CAMPAIGNS.filter(c => cat === "todos" || c.categoria === cat).map(campaign => (
                    <CampaignCard key={campaign.id} campaign={campaign} />
                  ))}
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
      </Tabs>
    </div>
  );
}
