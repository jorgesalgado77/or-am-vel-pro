export interface Template {
  id: string;
  nome: string;
  categoria: string;
  width: number;
  height: number;
  bgColor: string;
  accentColor: string;
  textColor: string;
  layout: "centered" | "split" | "banner";
  placeholders: { headline: string; subtext: string; cta: string; badge?: string };
}

export interface CampaignImageDraft {
  title: string;
  storeName: string;
  headline: string;
  subtext: string;
  cta: string;
  badge: string;
  bgColor: string;
  accentColor: string;
  bgImage: string | null;
  headlineFontFamily: string;
  bodyFontFamily: string;
  ctaFontFamily: string;
  badgeFontFamily: string;
  storeNameFontFamily: string;
  headlineSize: number;
  subtextSize: number;
  ctaSize: number;
  badgeSize: number;
  storeNameSize: number;
  headlineColor: string;
  subtextColor: string;
  ctaTextColor: string;
  badgeTextColor: string;
  storeNameColor: string;
}

export interface SavedCampaignImage {
  id: string;
  tenantId?: string | null;
  title: string;
  imageUrl: string;
  templateId: string;
  createdAt: string;
  source: "cloud" | "local";
  draft: CampaignImageDraft;
}

export const FONT_OPTIONS = [
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Trebuchet", value: "'Trebuchet MS', sans-serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times", value: "'Times New Roman', serif" },
  { label: "Impact", value: "Impact, fantasy" },
];

export const TEMPLATES: Template[] = [
  { id: "coz-promo", nome: "Cozinha — Promoção", categoria: "cozinha", width: 1080, height: 1080, bgColor: "#1a1a2e", accentColor: "#e94560", textColor: "#ffffff", layout: "centered", placeholders: { headline: "Cozinha Planejada", subtext: "Projeto 3D Gratuito + Parcele em 60x", cta: "SOLICITE AGORA", badge: "PROMOÇÃO" } },
  { id: "coz-story", nome: "Cozinha — Stories", categoria: "cozinha", width: 1080, height: 1920, bgColor: "#0f3460", accentColor: "#e94560", textColor: "#ffffff", layout: "split", placeholders: { headline: "Sua Cozinha dos Sonhos", subtext: "Projeto 3D 100% Gratuito", cta: "ARRASTE PRA CIMA" } },
  { id: "qrt-feed", nome: "Quarto — Feed", categoria: "quarto", width: 1080, height: 1080, bgColor: "#2d3436", accentColor: "#6c5ce7", textColor: "#ffffff", layout: "centered", placeholders: { headline: "Quarto Planejado", subtext: "Armários sob medida com design exclusivo", cta: "PEÇA SEU PROJETO", badge: "EXCLUSIVO" } },
  { id: "qrt-story", nome: "Quarto — Stories", categoria: "quarto", width: 1080, height: 1920, bgColor: "#2d3436", accentColor: "#a29bfe", textColor: "#ffffff", layout: "split", placeholders: { headline: "Closet dos Sonhos", subtext: "100% sob medida para você", cta: "SAIBA MAIS" } },
  { id: "plan-feed", nome: "Planejados — Feed", categoria: "planejados", width: 1080, height: 1080, bgColor: "#222f3e", accentColor: "#ff6348", textColor: "#ffffff", layout: "centered", placeholders: { headline: "Móveis Planejados", subtext: "Todos os ambientes com projeto 3D grátis", cta: "FALE CONOSCO", badge: "ATÉ 20% OFF" } },
  { id: "plan-banner", nome: "Planejados — Banner", categoria: "planejados", width: 1200, height: 628, bgColor: "#130f40", accentColor: "#f39c12", textColor: "#ffffff", layout: "banner", placeholders: { headline: "Promoção Imperdível", subtext: "Projeto 3D Gratuito + Condições Especiais", cta: "APROVEITE" } },
  { id: "maes-feed", nome: "Dia das Mães — Feed", categoria: "datas", width: 1080, height: 1080, bgColor: "#ffeaa7", accentColor: "#e17055", textColor: "#2d3436", layout: "centered", placeholders: { headline: "Presente para Mãe", subtext: "A cozinha que ela sempre sonhou", cta: "SURPREENDA ELA", badge: "DIA DAS MÃES" } },
  { id: "bf-feed", nome: "Black Friday — Feed", categoria: "datas", width: 1080, height: 1080, bgColor: "#000000", accentColor: "#fdcb6e", textColor: "#ffffff", layout: "centered", placeholders: { headline: "BLACK FRIDAY", subtext: "Até 30% OFF em todos os ambientes", cta: "GARANTA JÁ", badge: "ATÉ 30% OFF" } },
  { id: "natal-feed", nome: "Natal — Feed", categoria: "datas", width: 1080, height: 1080, bgColor: "#c0392b", accentColor: "#f1c40f", textColor: "#ffffff", layout: "centered", placeholders: { headline: "Natal com Desconto", subtext: "Renove sua casa para as festas", cta: "APROVEITE", badge: "NATAL" } },
];

export function createDraftFromTemplate(t: Template): CampaignImageDraft {
  return {
    title: t.nome,
    storeName: "Sua Loja",
    headline: t.placeholders.headline,
    subtext: t.placeholders.subtext,
    cta: t.placeholders.cta,
    badge: t.placeholders.badge || "",
    bgColor: t.bgColor,
    accentColor: t.accentColor,
    bgImage: null,
    headlineFontFamily: "Arial, sans-serif",
    bodyFontFamily: "'Trebuchet MS', sans-serif",
    ctaFontFamily: "Arial, sans-serif",
    badgeFontFamily: "Arial, sans-serif",
    headlineSize: t.layout === "banner" ? 74 : 72,
    subtextSize: t.layout === "banner" ? 28 : 34,
    ctaSize: t.layout === "banner" ? 28 : 30,
    badgeSize: t.layout === "banner" ? 24 : 28,
    headlineColor: t.textColor,
    subtextColor: t.textColor,
    ctaTextColor: t.bgColor,
    badgeTextColor: t.bgColor,
  };
}