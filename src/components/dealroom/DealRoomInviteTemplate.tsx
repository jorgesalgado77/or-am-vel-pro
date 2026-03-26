/**
 * Deal Room invite template with QR code for client access.
 * Generates a shareable message + QR code image.
 */
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  QrCode, Copy, ExternalLink, Download, Video, Sparkles, Image, Bot,
} from "lucide-react";
import { toast } from "sonner";

interface DealRoomInviteTemplateProps {
  tenantId: string;
  clientName?: string;
  proposalValue?: number;
  sellerName?: string;
  roomId?: string;
}

// Simple QR code generator using Canvas (no external dependency)
function generateQRCodeDataURL(text: string, size: number = 200): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&bgcolor=ffffff&color=000000&margin=8`;
}

const INVITE_TEMPLATES = [
  {
    id: "premium",
    label: "Premium",
    template: (name: string, seller: string, link: string) =>
      `Olá ${name}! 👋\n\nPreparei algo especial para você: uma *Sala de Apresentação Exclusiva* onde você poderá:\n\n✅ Ver seu projeto completo em tempo real\n✅ Pedir ajustes ao vivo\n✅ Negociar condições especiais\n✅ Fechar com contrato imediato\n\nTudo no conforto da sua casa! 🏠\n\n📱 Acesse pelo QR Code ou pelo link:\n${link}\n\nTe espero lá! 🤝\n${seller}`,
  },
  {
    id: "urgente",
    label: "Urgente",
    template: (name: string, seller: string, link: string) =>
      `${name}, reservei um horário especial para sua apresentação! ⏰\n\nSua *Sala VIP* está pronta com:\n🎯 Projeto 3D exclusivo\n💰 Condições válidas apenas nesta sessão\n📄 Contrato disponível para fechamento imediato\n\nAcesse agora:\n${link}\n\n⚠️ O link expira em 24h.\n${seller}`,
  },
  {
    id: "casual",
    label: "Casual",
    template: (name: string, seller: string, link: string) =>
      `Oi ${name}! Tudo bem?\n\nCriei uma sala online pra gente conversar sobre o seu projeto de móveis. É super prático — você entra pelo celular ou computador e a gente resolve tudo por lá! 😊\n\n📲 Só clicar:\n${link}\n\nQualquer dúvida, estou aqui!\n${seller}`,
  },
];

const CONNECTED_AIS = [
  { name: "VendaZap IA", status: "ativa", color: "text-green-500" },
  { name: "OpenAI GPT", status: "conectada", color: "text-blue-500" },
  { name: "Deal Room IA", status: "ativa", color: "text-purple-500" },
];

export function DealRoomInviteTemplate({ tenantId, clientName, proposalValue, sellerName, roomId }: DealRoomInviteTemplateProps) {
  const [selectedTemplate, setSelectedTemplate] = useState("premium");
  const [customClientName, setCustomClientName] = useState(clientName || "");
  const [customSellerName, setCustomSellerName] = useState(sellerName || "Equipe");
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const dealRoomLink = roomId
    ? `${window.location.origin}/sala/${roomId}`
    : `${window.location.origin}/app`;

  useEffect(() => {
    setQrCodeUrl(generateQRCodeDataURL(dealRoomLink, 300));
  }, [dealRoomLink]);

  const currentTemplate = INVITE_TEMPLATES.find(t => t.id === selectedTemplate) || INVITE_TEMPLATES[0];
  const generatedMessage = currentTemplate.template(
    customClientName || "Cliente",
    customSellerName || "Equipe",
    dealRoomLink
  );

  const handleCopy = () => {
    const fullMessage = `${generatedMessage}\n\n🔗 Link direto: ${dealRoomLink}`;
    navigator.clipboard.writeText(fullMessage);
    toast.success("Convite completo copiado (texto + link)!");
  };

  const handleDownloadFullImage = async () => {
    setIsGeneratingImage(true);
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      const width = 800;
      const padding = 40;
      const qrSize = 200;

      // Load QR code image first
      const qrImg = new window.Image();
      qrImg.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        qrImg.onload = () => resolve();
        qrImg.onerror = () => reject(new Error("Falha ao carregar QR Code"));
        qrImg.src = qrCodeUrl;
      });

      // Measure text to calculate canvas height
      ctx.font = "16px Arial, sans-serif";
      const maxTextWidth = width - padding * 2;
      const lines = wrapText(ctx, generatedMessage, maxTextWidth);
      const linkText = `🔗 ${dealRoomLink}`;
      const linkLines = wrapText(ctx, linkText, maxTextWidth);

      const headerHeight = 50;
      const textHeight = lines.length * 22;
      const linkHeight = linkLines.length * 22 + 20;
      const qrSectionHeight = qrSize + 40;
      const totalHeight = headerHeight + padding + textHeight + linkHeight + qrSectionHeight + padding * 2;

      canvas.width = width;
      canvas.height = totalHeight;

      // Background gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, totalHeight);
      gradient.addColorStop(0, "#1a1a2e");
      gradient.addColorStop(1, "#16213e");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, totalHeight);

      // Header bar
      ctx.fillStyle = "#0f3460";
      ctx.fillRect(0, 0, width, headerHeight);
      ctx.font = "bold 18px Arial, sans-serif";
      ctx.fillStyle = "#e94560";
      ctx.fillText("🚀 Convite Deal Room", padding, 32);

      // AI badge
      ctx.font = "11px Arial, sans-serif";
      ctx.fillStyle = "#00d4aa";
      ctx.fillText("🤖 IA Ativa", width - padding - 80, 32);

      // Message text
      let y = headerHeight + padding;
      ctx.font = "15px Arial, sans-serif";
      ctx.fillStyle = "#e0e0e0";
      for (const line of lines) {
        ctx.fillText(line, padding, y);
        y += 22;
      }

      // Link
      y += 10;
      ctx.fillStyle = "#4fc3f7";
      ctx.font = "14px Arial, sans-serif";
      for (const line of linkLines) {
        ctx.fillText(line, padding, y);
        y += 22;
      }

      // QR Code centered
      y += 10;
      const qrX = (width - qrSize) / 2;
      // White background behind QR
      ctx.fillStyle = "#ffffff";
      const qrPad = 12;
      ctx.beginPath();
      ctx.roundRect(qrX - qrPad, y - qrPad, qrSize + qrPad * 2, qrSize + qrPad * 2, 12);
      ctx.fill();
      ctx.drawImage(qrImg, qrX, y, qrSize, qrSize);

      // Label below QR
      ctx.font = "12px Arial, sans-serif";
      ctx.fillStyle = "#aaaaaa";
      ctx.textAlign = "center";
      ctx.fillText("Escaneie para acessar a sala", width / 2, y + qrSize + 24);
      ctx.textAlign = "start";

      // Download
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `convite-dealroom-${customClientName?.replace(/\s+/g, "-") || "cliente"}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("Imagem do convite gerada com sucesso!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar imagem do convite");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleDownloadQR = async () => {
    try {
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dealroom-qr-${customClientName?.replace(/\s+/g, "-") || "convite"}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("QR Code salvo!");
    } catch {
      toast.error("Erro ao baixar QR Code");
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Video className="h-4 w-4 text-primary" />
          Convite para Deal Room
          <Badge variant="outline" className="text-[9px] ml-auto">Template</Badge>
        </CardTitle>

        {/* AI Status Banner */}
        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 mt-2">
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-[11px] font-semibold text-primary">I.A. Ativa</span>
          <div className="flex items-center gap-1.5 ml-auto flex-wrap justify-end">
            {CONNECTED_AIS.map(ai => (
              <Badge key={ai.name} variant="secondary" className="text-[8px] h-4 gap-1 px-1.5">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${ai.color} bg-current`} />
                {ai.name}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Client/Seller Names */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Nome do Cliente</label>
            <Input
              value={customClientName}
              onChange={e => setCustomClientName(e.target.value)}
              placeholder="Nome do cliente"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Seu Nome</label>
            <Input
              value={customSellerName}
              onChange={e => setCustomSellerName(e.target.value)}
              placeholder="Seu nome"
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Template Selection */}
        <div className="flex gap-2">
          {INVITE_TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedTemplate(t.id)}
              className={`flex-1 py-1.5 px-3 rounded-lg border-2 text-xs font-medium transition-all duration-300 ${
                selectedTemplate === t.id
                  ? "border-primary bg-primary/15 text-primary ring-1 ring-primary/20 scale-[1.02]"
                  : "border-border text-foreground hover:border-muted-foreground/30"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* QR Code + Message Preview */}
        <div className="grid grid-cols-[auto_1fr] gap-4">
          {/* QR Code */}
          <div className="flex flex-col items-center gap-2">
            <div className="border-2 border-primary/20 rounded-xl p-2 bg-white">
              {qrCodeUrl && (
                <img
                  src={qrCodeUrl}
                  alt="QR Code Deal Room"
                  className="w-28 h-28 rounded-lg"
                  crossOrigin="anonymous"
                />
              )}
            </div>
            <Button size="sm" variant="outline" className="h-6 text-[9px] gap-1 w-full" onClick={handleDownloadQR}>
              <Download className="h-2.5 w-2.5" /> Baixar QR
            </Button>
          </div>

          {/* Message Preview */}
          <div className="bg-muted/50 border rounded-lg p-3 text-[11px] text-foreground whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto"
            style={{ scrollbarWidth: "none" }}
          >
            {generatedMessage}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 gap-1.5 h-8 text-xs" onClick={handleCopy}>
            <Copy className="h-3 w-3" /> Copiar Convite Completo
          </Button>
          <Button
            size="sm"
            className="flex-1 gap-1.5 h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleDownloadFullImage}
            disabled={isGeneratingImage}
          >
            <Image className="h-3 w-3" />
            {isGeneratingImage ? "Gerando..." : "Baixar Imagem Completa"}
          </Button>
        </div>

        {/* Link Display */}
        <div className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2">
          <QrCode className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-[10px] text-muted-foreground truncate flex-1 font-mono">{dealRoomLink}</span>
          <Button size="sm" variant="ghost" className="h-5 text-[9px] px-2" onClick={() => { navigator.clipboard.writeText(dealRoomLink); toast.success("Link copiado!"); }}>
            <Copy className="h-2.5 w-2.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Utility: wrap text into lines that fit a given max width */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const result: string[] = [];
  const paragraphs = text.split("\n");
  for (const para of paragraphs) {
    if (para.trim() === "") {
      result.push("");
      continue;
    }
    const words = para.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        result.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) result.push(line);
  }
  return result;
}