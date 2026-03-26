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
  QrCode, Copy, ExternalLink, Download, Video, Sparkles,
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
  // Use a public QR code API for simplicity
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

export function DealRoomInviteTemplate({ tenantId, clientName, proposalValue, sellerName, roomId }: DealRoomInviteTemplateProps) {
  const [selectedTemplate, setSelectedTemplate] = useState("premium");
  const [customClientName, setCustomClientName] = useState(clientName || "");
  const [customSellerName, setCustomSellerName] = useState(sellerName || "Equipe");
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
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
    navigator.clipboard.writeText(generatedMessage);
    toast.success("Convite copiado!");
  };

  const handleCopyForWhatsApp = () => {
    navigator.clipboard.writeText(generatedMessage);
    toast.success("Texto copiado! Cole no WhatsApp.");
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
            <Copy className="h-3 w-3" /> Copiar
          </Button>
          <Button size="sm" className="flex-1 gap-1.5 h-8 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={handleCopyForWhatsApp}>
            <Copy className="h-3 w-3" /> WhatsApp
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
