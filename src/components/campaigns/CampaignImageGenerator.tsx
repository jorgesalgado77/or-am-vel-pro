import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Image, Download, Palette, Upload, X } from "lucide-react";
import { toast } from "sonner";

interface Template {
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

const TEMPLATES: Template[] = [
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

function CanvasPreview({ template, customTexts, bgImage }: { template: Template; customTexts: { headline: string; subtext: string; cta: string; badge?: string; storeName: string }; bgImage?: string | null }) {
  const scale = template.layout === "split" ? 0.2 : template.layout === "banner" ? 0.35 : 0.3;
  const w = template.width * scale;
  const h = template.height * scale;

  return (
    <div className="relative overflow-hidden rounded-lg shadow-lg mx-auto" style={{ width: w, height: h, backgroundColor: template.bgColor }}>
      {bgImage && (
        <div className="absolute inset-0" style={{ backgroundImage: `url(${bgImage})`, backgroundSize: "cover", backgroundPosition: "center" }}>
          <div className="absolute inset-0 bg-black/50" />
        </div>
      )}
      {!bgImage && (
        <div className="absolute inset-0 opacity-10" style={{ background: `radial-gradient(circle at 20% 80%, ${template.accentColor} 0%, transparent 50%), radial-gradient(circle at 80% 20%, ${template.accentColor} 0%, transparent 50%)` }} />
      )}
      {customTexts.badge && (
        <div className="absolute top-3 right-3 px-2 py-0.5 rounded text-[8px] font-bold tracking-wider z-10" style={{ backgroundColor: template.accentColor, color: template.bgColor }}>{customTexts.badge}</div>
      )}
      <div className={`absolute inset-0 flex flex-col items-center justify-center p-4 text-center gap-1.5 z-10 ${template.layout === "split" ? "justify-end pb-8" : ""}`}>
        <p className="text-[7px] font-medium uppercase tracking-widest opacity-70" style={{ color: template.accentColor }}>{customTexts.storeName}</p>
        <h3 className="font-bold leading-tight" style={{ color: template.textColor, fontSize: template.layout === "banner" ? 16 : 14 }}>{customTexts.headline}</h3>
        <p className="text-[9px] opacity-80 max-w-[80%]" style={{ color: template.textColor }}>{customTexts.subtext}</p>
        <div className="mt-1 px-3 py-1 rounded-full text-[8px] font-bold tracking-wide" style={{ backgroundColor: template.accentColor, color: template.bgColor }}>{customTexts.cta}</div>
      </div>
    </div>
  );
}

export function CampaignImageGenerator() {
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(TEMPLATES[0]);
  const [headline, setHeadline] = useState(TEMPLATES[0].placeholders.headline);
  const [subtext, setSubtext] = useState(TEMPLATES[0].placeholders.subtext);
  const [cta, setCta] = useState(TEMPLATES[0].placeholders.cta);
  const [badge, setBadge] = useState(TEMPLATES[0].placeholders.badge || "");
  const [storeName, setStoreName] = useState("Sua Loja");
  const [bgColor, setBgColor] = useState(TEMPLATES[0].bgColor);
  const [accentColor, setAccentColor] = useState(TEMPLATES[0].accentColor);
  const [filterCat, setFilterCat] = useState("todos");
  const [bgImage, setBgImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectTemplate = (t: Template) => {
    setSelectedTemplate(t);
    setHeadline(t.placeholders.headline);
    setSubtext(t.placeholders.subtext);
    setCta(t.placeholders.cta);
    setBadge(t.placeholders.badge || "");
    setBgColor(t.bgColor);
    setAccentColor(t.accentColor);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione um arquivo de imagem."); return; }
    const reader = new FileReader();
    reader.onload = () => setBgImage(reader.result as string);
    reader.readAsDataURL(file);
    toast.success("Imagem de fundo carregada!");
  };

  const generateAndDownload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = selectedTemplate.width;
    canvas.height = selectedTemplate.height;
    const ctx = canvas.getContext("2d")!;

    const drawContent = () => {
      if (!bgImage) {
        // Decorative gradients
        const grad1 = ctx.createRadialGradient(canvas.width * 0.2, canvas.height * 0.8, 0, canvas.width * 0.2, canvas.height * 0.8, canvas.width * 0.5);
        grad1.addColorStop(0, accentColor + "30"); grad1.addColorStop(1, "transparent");
        ctx.fillStyle = grad1; ctx.fillRect(0, 0, canvas.width, canvas.height);
        const grad2 = ctx.createRadialGradient(canvas.width * 0.8, canvas.height * 0.2, 0, canvas.width * 0.8, canvas.height * 0.2, canvas.width * 0.5);
        grad2.addColorStop(0, accentColor + "20"); grad2.addColorStop(1, "transparent");
        ctx.fillStyle = grad2; ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Geometric
        ctx.strokeStyle = accentColor + "15"; ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(canvas.width * 0.5, canvas.height * 0.5, 100 + i * 60, 0, Math.PI * 2); ctx.stroke(); }
      } else {
        // Dark overlay on image
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      const centerY = selectedTemplate.layout === "split" ? canvas.height * 0.7 : canvas.height * 0.5;

      if (badge) {
        ctx.font = `bold ${Math.round(canvas.width * 0.028)}px Arial, sans-serif`;
        const bw = ctx.measureText(badge).width + 40; const bh = 40;
        ctx.fillStyle = accentColor; ctx.beginPath(); ctx.roundRect(canvas.width - bw - 30, 30, bw, bh, 6); ctx.fill();
        ctx.fillStyle = bgColor; ctx.textAlign = "center"; ctx.fillText(badge, canvas.width - bw / 2 - 30, 30 + bh / 2 + 5);
      }

      ctx.fillStyle = accentColor;
      ctx.font = `600 ${Math.round(canvas.width * 0.022)}px Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(storeName.toUpperCase(), canvas.width / 2, centerY - 80);

      ctx.fillStyle = selectedTemplate.textColor;
      ctx.font = `bold ${Math.round(canvas.width * 0.06)}px Arial, sans-serif`;
      ctx.textAlign = "center";
      const words = headline.split(" "); let lines: string[] = []; let currentLine = "";
      for (const word of words) { const test = currentLine ? `${currentLine} ${word}` : word; if (ctx.measureText(test).width > canvas.width * 0.8) { lines.push(currentLine); currentLine = word; } else { currentLine = test; } }
      if (currentLine) lines.push(currentLine);
      const lineHeight = canvas.width * 0.07;
      const startY = centerY - (lines.length - 1) * lineHeight / 2;
      lines.forEach((line, i) => { ctx.fillText(line, canvas.width / 2, startY + i * lineHeight); });

      ctx.globalAlpha = 0.8;
      ctx.font = `${Math.round(canvas.width * 0.032)}px Arial, sans-serif`;
      ctx.fillText(subtext, canvas.width / 2, startY + lines.length * lineHeight + 20);
      ctx.globalAlpha = 1;

      const ctaY = startY + lines.length * lineHeight + 70;
      ctx.font = `bold ${Math.round(canvas.width * 0.028)}px Arial, sans-serif`;
      const ctaW = ctx.measureText(cta).width + 80; const ctaH = 50;
      ctx.fillStyle = accentColor; ctx.beginPath(); ctx.roundRect(canvas.width / 2 - ctaW / 2, ctaY, ctaW, ctaH, 25); ctx.fill();
      ctx.fillStyle = bgColor; ctx.textAlign = "center"; ctx.fillText(cta, canvas.width / 2, ctaY + ctaH / 2 + 5);

      const link = document.createElement("a");
      link.download = `campanha-${selectedTemplate.id}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Imagem gerada e baixada!");
    };

    if (bgImage) {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        drawContent();
      };
      img.src = bgImage;
    } else {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawContent();
    }
  };

  const filteredTemplates = TEMPLATES.filter(t => filterCat === "todos" || t.categoria === filterCat);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Image className="h-5 w-5 text-primary" /> Gerador de Imagens
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-2 block">Escolha um template</Label>
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {["todos", "cozinha", "quarto", "planejados", "datas"].map(c => (
              <Badge key={c} variant={filterCat === c ? "default" : "outline"} className="cursor-pointer capitalize text-xs" onClick={() => setFilterCat(c)}>
                {c === "todos" ? "Todos" : c === "datas" ? "Datas Comemorativas" : c.charAt(0).toUpperCase() + c.slice(1)}
              </Badge>
            ))}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
            {filteredTemplates.map(t => (
              <button key={t.id} onClick={() => selectTemplate(t)}
                className={`p-2 rounded-lg border-2 transition-all text-left ${selectedTemplate.id === t.id ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}>
                <div className="w-full aspect-square rounded mb-1" style={{ backgroundColor: t.bgColor, position: "relative", overflow: "hidden" }}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[8px] font-bold" style={{ color: t.textColor }}>{t.placeholders.headline}</span>
                  </div>
                </div>
                <p className="text-[10px] font-medium truncate">{t.nome}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            {/* Upload Image */}
            <div className="border-2 border-dashed border-muted-foreground/20 rounded-lg p-3 text-center">
              <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
              {bgImage ? (
                <div className="flex items-center gap-2 justify-center">
                  <img src={bgImage} alt="bg" className="h-10 w-10 rounded object-cover" />
                  <span className="text-xs text-muted-foreground">Imagem de fundo aplicada</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setBgImage(null)}><X className="h-3 w-3" /></Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="gap-2 text-xs" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" /> Enviar imagem de fundo
                </Button>
              )}
            </div>

            <div>
              <Label className="text-xs">Nome da Loja</Label>
              <Input value={storeName} onChange={e => setStoreName(e.target.value)} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Headline</Label>
              <Input value={headline} onChange={e => setHeadline(e.target.value)} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Subtexto</Label>
              <Input value={subtext} onChange={e => setSubtext(e.target.value)} className="mt-1 h-8 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">CTA</Label>
                <Input value={cta} onChange={e => setCta(e.target.value)} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Badge</Label>
                <Input value={badge} onChange={e => setBadge(e.target.value)} placeholder="Opcional" className="mt-1 h-8 text-sm" />
              </div>
            </div>
            {!bgImage && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs flex items-center gap-1"><Palette className="h-3 w-3" /> Fundo</Label>
                  <div className="flex gap-2 mt-1">
                    <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="h-8 w-10 rounded border cursor-pointer" />
                    <Input value={bgColor} onChange={e => setBgColor(e.target.value)} className="h-8 text-xs flex-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1"><Palette className="h-3 w-3" /> Destaque</Label>
                  <div className="flex gap-2 mt-1">
                    <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} className="h-8 w-10 rounded border cursor-pointer" />
                    <Input value={accentColor} onChange={e => setAccentColor(e.target.value)} className="h-8 text-xs flex-1" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-3">
            <Label className="text-xs text-muted-foreground">Pré-visualização</Label>
            <CanvasPreview template={{ ...selectedTemplate, bgColor, accentColor }} customTexts={{ headline, subtext, cta, badge, storeName }} bgImage={bgImage} />
            <div className="flex gap-2">
              <Button onClick={generateAndDownload} className="gap-2">
                <Download className="h-4 w-4" /> Baixar Imagem
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              {selectedTemplate.width}x{selectedTemplate.height}px • PNG de alta qualidade
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
