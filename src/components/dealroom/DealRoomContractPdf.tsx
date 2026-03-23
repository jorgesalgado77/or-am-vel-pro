import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FileText, Download, Send, ExternalLink, CheckCircle, Shield,
} from "lucide-react";
import { formatCurrency } from "@/lib/financing";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import jsPDF from "jspdf";

interface DealRoomContractPdfProps {
  tenantId: string;
  sessionId: string;
  clientName?: string;
  clientCpf?: string;
  clientRg?: string;
  clientEndereco?: string;
  proposalValue?: number;
  storeName?: string;
  storePhone?: string;
  signatureDataUrl?: string;
}

export function DealRoomContractPdf({
  tenantId, sessionId, clientName, clientCpf, clientRg, clientEndereco,
  proposalValue, storeName, storePhone, signatureDataUrl,
}: DealRoomContractPdfProps) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [govBrEmail, setGovBrEmail] = useState("");

  const generateContractPdf = (): jsPDF => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = 30;

    // Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("CONTRATO DE VENDA", pageWidth / 2, y, { align: "center" });
    y += 10;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Emitido por: ${storeName || "Loja"}`, pageWidth / 2, y, { align: "center" });
    y += 5;
    doc.text(`Contato: ${storePhone || "—"}`, pageWidth / 2, y, { align: "center" });
    y += 5;
    doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, pageWidth / 2, y, { align: "center" });
    y += 15;

    // Divider
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;

    // Client info
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("DADOS DO CONTRATANTE", margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const clientInfo = [
      `Nome: ${clientName || "—"}`,
      `CPF: ${clientCpf || "—"}`,
      `RG: ${clientRg || "—"}`,
      `Endereço: ${clientEndereco || "—"}`,
    ];
    clientInfo.forEach(line => {
      doc.text(line, margin, y);
      y += 6;
    });
    y += 5;

    // Value
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("VALOR DO CONTRATO", margin, y);
    y += 8;
    doc.setFontSize(14);
    doc.text(formatCurrency(proposalValue || 0), margin, y);
    y += 15;

    // Terms
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("TERMOS E CONDIÇÕES", margin, y);
    y += 8;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const terms = [
      "1. O presente contrato estabelece os termos de compra e venda dos móveis planejados descritos no projeto.",
      "2. O prazo de entrega será acordado entre as partes após confirmação do pagamento.",
      "3. O pagamento deverá ser realizado conforme forma acordada na proposta comercial.",
      "4. Eventuais alterações no projeto após assinatura estarão sujeitas a novo orçamento.",
      "5. A garantia dos produtos segue as normas do Código de Defesa do Consumidor.",
      "6. Este contrato tem validade após assinatura digital de ambas as partes.",
    ];
    terms.forEach(term => {
      const lines = doc.splitTextToSize(term, pageWidth - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * 5 + 3;
    });
    y += 10;

    // Signature
    if (signatureDataUrl) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("ASSINATURA DIGITAL DO CLIENTE", margin, y);
      y += 5;
      try {
        doc.addImage(signatureDataUrl, "PNG", margin, y, 60, 25);
        y += 30;
      } catch {
        doc.text("[Assinatura digital anexada]", margin, y);
        y += 8;
      }
      doc.text(`${clientName || "Cliente"} — CPF: ${clientCpf || "—"}`, margin, y);
      y += 6;
      doc.text(`Data da assinatura: ${new Date().toLocaleString("pt-BR")}`, margin, y);
    }

    // Footer
    y = doc.internal.pageSize.getHeight() - 15;
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Sessão: ${sessionId} | Gerado via Deal Room`, pageWidth / 2, y, { align: "center" });

    return doc;
  };

  const handleDownload = () => {
    const doc = generateContractPdf();
    doc.save(`contrato-${sessionId.slice(0, 8)}.pdf`);
    toast.success("Contrato baixado com sucesso!");
  };

  const handleSendAsAttachment = async () => {
    setSending(true);
    try {
      const doc = generateContractPdf();
      const blob = doc.output("blob");
      const filePath = `${tenantId}/contratos/${sessionId}-${Date.now()}.pdf`;

      const { error } = await supabase.storage
        .from("dealroom-attachments")
        .upload(filePath, blob, { contentType: "application/pdf" });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from("dealroom-attachments")
        .getPublicUrl(filePath);

      // Save as attachment in the session
      await supabase.from("dealroom_attachments" as any).insert({
        session_id: sessionId,
        tenant_id: tenantId,
        file_name: `contrato-${clientName || "cliente"}.pdf`,
        file_url: urlData.publicUrl,
        file_type: "application/pdf",
        file_size: blob.size,
        sender: "projetista",
      });

      // Notify in chat
      await supabase.from("dealroom_chat_messages" as any).insert({
        session_id: sessionId,
        sender: "projetista",
        message: `📄 Contrato enviado como anexo: contrato-${clientName || "cliente"}.pdf`,
      });

      setSent(true);
      toast.success("Contrato enviado como anexo na sala!");
    } catch (err) {
      toast.error("Erro ao enviar contrato");
      console.error(err);
    }
    setSending(false);
  };

  const handleGovBrSignature = () => {
    if (!govBrEmail.trim()) {
      toast.error("Informe o email cadastrado no gov.br");
      return;
    }
    // Open gov.br signature portal
    const govBrUrl = "https://assinador.iti.br";
    window.open(govBrUrl, "_blank");
    toast.info(
      "Acesse o assinador gov.br, faça login com sua conta gov.br e envie o PDF do contrato para assinar digitalmente.",
      { duration: 8000 }
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Contrato da Venda
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-xs">
            <p><strong>Cliente:</strong> {clientName || "—"}</p>
            <p><strong>Valor:</strong> {formatCurrency(proposalValue || 0)}</p>
            <p><strong>Sessão:</strong> {sessionId.slice(0, 8)}...</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5" /> Baixar PDF
            </Button>
            <Button size="sm" className="gap-1.5 text-xs" onClick={handleSendAsAttachment}
              disabled={sending || sent}>
              {sent ? <CheckCircle className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
              {sent ? "Enviado!" : sending ? "Enviando..." : "Enviar ao Cliente"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Gov.br Digital Signature */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-green-600" /> Assinatura via Gov.br
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Assine o contrato digitalmente usando sua conta Gov.br com validade jurídica (ICP-Brasil).
          </p>

          <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
            <p className="text-[10px] text-muted-foreground flex items-start gap-1.5">
              <span className="text-primary font-bold">1.</span> Baixe o PDF do contrato acima
            </p>
            <p className="text-[10px] text-muted-foreground flex items-start gap-1.5">
              <span className="text-primary font-bold">2.</span> Acesse o assinador gov.br (assinador.iti.br)
            </p>
            <p className="text-[10px] text-muted-foreground flex items-start gap-1.5">
              <span className="text-primary font-bold">3.</span> Faça login com conta Gov.br (nível prata ou ouro)
            </p>
            <p className="text-[10px] text-muted-foreground flex items-start gap-1.5">
              <span className="text-primary font-bold">4.</span> Envie o PDF e assine digitalmente
            </p>
            <p className="text-[10px] text-muted-foreground flex items-start gap-1.5">
              <span className="text-primary font-bold">5.</span> Baixe o PDF assinado e anexe na sala
            </p>
          </div>

          <div>
            <Label className="text-xs">Email cadastrado no Gov.br (do cliente)</Label>
            <Input
              className="h-8 text-xs mt-1"
              placeholder="cliente@email.com"
              type="email"
              value={govBrEmail}
              onChange={e => setGovBrEmail(e.target.value)}
            />
          </div>

          <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={handleGovBrSignature}>
            <ExternalLink className="h-3.5 w-3.5" /> Abrir Assinador Gov.br
          </Button>

          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[9px] gap-1">
              <Shield className="h-2.5 w-2.5" /> ICP-Brasil
            </Badge>
            <span className="text-[9px] text-muted-foreground">Validade jurídica garantida</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
