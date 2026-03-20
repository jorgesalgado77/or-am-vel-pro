import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, CheckCircle2, Lightbulb, Target, MessageSquare, Image, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

interface Campaign {
  id: string;
  titulo: string;
  categoria: "cozinha" | "quarto" | "planejados";
  plataforma: "facebook" | "instagram" | "google";
  headline: string;
  copy: string;
  cta: string;
  instrucoes: string[];
  hashtags?: string[];
}

const CAMPAIGNS: Campaign[] = [
  // COZINHA
  {
    id: "coz-1",
    titulo: "Cozinha dos Sonhos — Projeto Grátis",
    categoria: "cozinha",
    plataforma: "facebook",
    headline: "🍳 Sua Cozinha Planejada com Projeto 3D GRÁTIS",
    copy: `Está pensando em renovar sua cozinha? Nós temos a solução perfeita!

✅ Projeto 3D gratuito e sem compromisso
✅ Materiais de alta qualidade
✅ Parcelamento em até 60x
✅ Entrega e montagem inclusa

📲 Clique no botão abaixo e solicite seu projeto agora!

⚡ Vagas limitadas este mês.`,
    cta: "Quero Meu Projeto Grátis",
    instrucoes: [
      "Crie um anúncio no Facebook Ads com objetivo 'Geração de Cadastros'",
      "Use imagens de cozinhas planejadas bonitas (fotos reais são melhores)",
      "Segmente por: idade 25-55, interesse em decoração/móveis/reforma",
      "Orçamento sugerido: R$ 20-30/dia",
      "Link de destino: sua landing page do funil de captação",
    ],
    hashtags: ["#CozinhaPlanejada", "#Projeto3DGratis", "#MoveisplanejadosPromo"],
  },
  {
    id: "coz-2",
    titulo: "Antes e Depois — Cozinha Transformada",
    categoria: "cozinha",
    plataforma: "instagram",
    headline: "De antiga para INCRÍVEL! 🔥 Veja a transformação",
    copy: `Olha só o que fizemos com essa cozinha! 😍

De um espaço sem graça para uma cozinha dos sonhos.

💡 E o melhor: o Projeto 3D é GRATUITO!

Quer ver como ficaria a SUA cozinha? 

👉 Toque em "Saiba Mais" e peça seu projeto sem compromisso!

#antesedepois #cozinhaplanejada #reforma`,
    cta: "Saiba Mais",
    instrucoes: [
      "Use formato Carrossel com 3-5 imagens de antes e depois",
      "Stories também funciona muito bem para esse formato",
      "Público: mulheres 28-50, interesses: decoração, Pinterest, Casa",
      "Orçamento sugerido: R$ 15-25/dia",
      "Inclua o link da sua landing page na bio ou no CTA",
    ],
  },
  // QUARTO
  {
    id: "qrt-1",
    titulo: "Quarto Planejado — Organize sua Vida",
    categoria: "quarto",
    plataforma: "facebook",
    headline: "🛏️ Seu Quarto Planejado com Projeto 3D GRÁTIS",
    copy: `Chega de bagunça! Transforme seu quarto em um espaço organizado e elegante.

✅ Armários sob medida
✅ Projeto 3D gratuito
✅ Aproveitamento total do espaço
✅ Parcelas que cabem no bolso

📲 Solicite agora seu projeto e veja a mágica acontecer!

⏰ Promoção por tempo limitado.`,
    cta: "Quero Meu Projeto Grátis",
    instrucoes: [
      "Objetivo da campanha: Geração de Cadastros ou Mensagens no WhatsApp",
      "Fotos de quartos planejados com boa iluminação",
      "Público: casais 25-45, recém-casados, quem acabou de mudar",
      "Orçamento sugerido: R$ 20-30/dia",
      "Use depoimentos de clientes satisfeitos quando possível",
    ],
    hashtags: ["#QuartoPlanejado", "#MoveissobMedida", "#OrganizaçãoTotal"],
  },
  {
    id: "qrt-2",
    titulo: "Closet dos Sonhos — Instagram Reels",
    categoria: "quarto",
    plataforma: "instagram",
    headline: "Seu closet dos sonhos está a um clique de distância ✨",
    copy: `Imagina ter TUDO organizado no seu closet! 👗👔

Nós projetamos sob medida pra você.

🎨 Projeto 3D GRÁTIS
📏 100% sob medida
💰 Condições especiais este mês

👉 Link na bio para solicitar!`,
    cta: "Link na Bio",
    instrucoes: [
      "Grave um vídeo curto (15-30s) mostrando um closet planejado",
      "Use música trending no Reels para mais alcance",
      "Formato vertical (9:16)",
      "Público: mulheres 25-45, interesse em moda e organização",
      "Orçamento: R$ 10-20/dia em impulsionamento",
    ],
  },
  // PLANEJADOS GERAL
  {
    id: "plan-1",
    titulo: "Móveis Planejados — Campanha Completa",
    categoria: "planejados",
    plataforma: "facebook",
    headline: "🏠 Móveis Planejados com Projeto 3D GRATUITO",
    copy: `Transforme sua casa com móveis sob medida!

🔹 Cozinha | Quarto | Sala | Banheiro | Escritório

✅ Projeto 3D gratuito e sem compromisso
✅ Materiais premium com garantia
✅ Parcelamos em até 60x sem juros*
✅ Entrega e montagem profissional

📞 Fale com um especialista agora!

*Consulte condições`,
    cta: "Falar com Especialista",
    instrucoes: [
      "Campanha institucional — use para captar leads de todos os ambientes",
      "Formato: imagem única ou carrossel com 1 foto de cada ambiente",
      "Público amplo: 25-55 anos, interesse em decoração e reforma",
      "Orçamento sugerido: R$ 30-50/dia",
      "Direcione para o WhatsApp ou landing page do funil",
    ],
    hashtags: ["#MoveisplanejadoS", "#SobMedida", "#Projeto3DGratis"],
  },
  {
    id: "plan-2",
    titulo: "Promoção Relâmpago — Todos os Ambientes",
    categoria: "planejados",
    plataforma: "instagram",
    headline: "⚡ PROMOÇÃO RELÂMPAGO: Até 20% OFF + Projeto 3D Grátis",
    copy: `🚨 SÓ ESTA SEMANA! 🚨

Até 20% de desconto em TODOS os ambientes planejados!

🔥 Cozinha
🔥 Quarto
🔥 Sala de Estar
🔥 Home Office
🔥 Banheiro

E ainda ganha o Projeto 3D de PRESENTE! 🎁

⏰ Válido até domingo. Corra!

👉 Toque em "Saiba Mais" e garanta!`,
    cta: "Saiba Mais",
    instrucoes: [
      "Use Stories + Feed + Reels para máximo alcance",
      "Crie senso de urgência com contagem regressiva nos Stories",
      "Público: remarketing (quem visitou site/perfil) + lookalike",
      "Orçamento: R$ 40-60/dia durante a promoção",
      "Landing page com timer de contagem regressiva",
    ],
  },
  {
    id: "plan-3",
    titulo: "Google Ads — Busca por Planejados",
    categoria: "planejados",
    plataforma: "google",
    headline: "Móveis Planejados | Projeto 3D Grátis | Parcele em 60x",
    copy: `Móveis planejados sob medida para sua casa. Projeto 3D gratuito e sem compromisso. Materiais premium com garantia. Solicite um orçamento agora!`,
    cta: "Solicitar Orçamento",
    instrucoes: [
      "Crie uma campanha de Pesquisa no Google Ads",
      "Palavras-chave: 'móveis planejados', 'cozinha planejada', 'armário sob medida', 'móveis planejados [sua cidade]'",
      "Use extensões de anúncio: local, telefone, sitelinks",
      "Orçamento: R$ 30-50/dia",
      "Landing page: sua página do funil de captação",
      "Negative keywords: 'grátis', 'usado', 'barato demais'",
    ],
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  cozinha: "Cozinha",
  quarto: "Quarto",
  planejados: "Planejados Geral",
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
        {/* Headline */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" /> Headline
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs gap-1"
              onClick={() => copyText(campaign.headline, "Headline")}
            >
              {copied === "Headline" ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              Copiar
            </Button>
          </div>
          <p className="text-sm font-medium bg-muted/50 rounded-lg px-3 py-2">{campaign.headline}</p>
        </div>

        {/* Copy */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> Copy do Anúncio
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs gap-1"
              onClick={() => copyText(campaign.copy, "Copy")}
            >
              {copied === "Copy" ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              Copiar
            </Button>
          </div>
          <pre className="text-sm whitespace-pre-wrap bg-muted/50 rounded-lg px-3 py-2 font-sans leading-relaxed max-h-48 overflow-y-auto">
            {campaign.copy}
          </pre>
        </div>

        {/* CTA */}
        <div className="flex items-center justify-between bg-primary/5 rounded-lg px-3 py-2">
          <span className="text-sm font-medium">CTA: <span className="text-primary">{campaign.cta}</span></span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={() => copyText(campaign.cta, "CTA")}
          >
            {copied === "CTA" ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>

        {/* Hashtags */}
        {campaign.hashtags && (
          <div className="flex flex-wrap gap-1.5">
            {campaign.hashtags.map((h) => (
              <Badge
                key={h}
                variant="outline"
                className="text-xs cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={() => copyText(h, h)}
              >
                {h}
              </Badge>
            ))}
          </div>
        )}

        {/* Instruções */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between text-xs font-medium text-muted-foreground h-8"
            onClick={() => setShowInstrucoes(!showInstrucoes)}
          >
            <span className="flex items-center gap-1">
              <Lightbulb className="h-3.5 w-3.5" />
              Como ativar esta campanha
            </span>
            {showInstrucoes ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
          {showInstrucoes && (
            <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground pl-1">
              {campaign.instrucoes.map((inst, i) => (
                <li key={i} className="flex gap-2">
                  <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
                    {i + 1}
                  </span>
                  <span className="leading-snug pt-0.5">{inst}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Copiar Campanha Completa */}
        <Button
          onClick={copyFullCampaign}
          className="w-full gap-2"
          variant={copied === "Campanha completa" ? "secondary" : "default"}
        >
          {copied === "Campanha completa" ? (
            <><CheckCircle2 className="h-4 w-4 text-green-500" /> Copiado!</>
          ) : (
            <><Copy className="h-4 w-4" /> Copiar Campanha Completa</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export function CampaignLibrary() {
  const categories = ["todos", "cozinha", "quarto", "planejados"];

  return (
    <div className="space-y-6 max-w-5xl">
      <Card className="border-none shadow-none bg-transparent">
        <CardHeader className="px-0 pt-0">
          <CardDescription className="text-base">
            Campanhas prontas para Facebook, Instagram e Google Ads. Copie o texto, adicione suas fotos e ative em minutos — sem precisar de agência.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="todos">
        <TabsList className="h-auto gap-1 flex-wrap">
          {categories.map((cat) => (
            <TabsTrigger key={cat} value={cat} className="capitalize">
              {cat === "todos" ? "Todas" : CATEGORY_LABELS[cat]}
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map((cat) => (
          <TabsContent key={cat} value={cat} className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {CAMPAIGNS.filter((c) => cat === "todos" || c.categoria === cat).map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
