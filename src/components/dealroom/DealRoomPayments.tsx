import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  QrCode, CreditCard, FileText, Upload, CheckCircle, Copy,
} from "lucide-react";
import { formatCurrency } from "@/lib/financing";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

interface DealRoomPaymentsProps {
  tenantId: string;
  proposalId?: string;
  proposalValue?: number;
  clientName?: string;
}

export function DealRoomPayments({ tenantId, proposalId, proposalValue, clientName }: DealRoomPaymentsProps) {
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [pixKey] = useState("sua-chave-pix@email.com");
  const [uploadingBoleto, setUploadingBoleto] = useState(false);
  const [boletoUrl, setBoletoUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handlePixCopy = () => {
    navigator.clipboard.writeText(pixKey);
    toast.success("Chave PIX copiada!");
  };

  const handleStripeCheckout = async () => {
    if (!proposalId) {
      toast.error("Proposta não vinculada");
      return;
    }
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: {
          proposal_id: proposalId,
          amount: proposalValue,
          client_name: clientName,
          tenant_id: tenantId,
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch {
      toast.error("Erro ao gerar link de pagamento");
    }
    setProcessing(false);
  };

  const handleBoletoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBoleto(true);

    const filePath = `${tenantId}/boletos/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage
      .from("dealroom-attachments")
      .upload(filePath, file);

    if (error) {
      toast.error("Erro ao enviar boleto");
      setUploadingBoleto(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("dealroom-attachments")
      .getPublicUrl(filePath);

    setBoletoUrl(urlData.publicUrl);
    toast.success("Boleto enviado com sucesso!");
    setUploadingBoleto(false);
  };

  const handleConfirmPayment = async () => {
    if (!proposalId) return;
    setProcessing(true);
    // Mark proposal as paid
    await supabase
      .from("dealroom_proposals" as any)
      .update({
        status: "paga",
        pago_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposalId);
    toast.success("Pagamento confirmado!");
    setProcessing(false);
  };

  return (
    <div className="space-y-4">
      <div className="text-center pb-2 border-b">
        <p className="text-xs text-muted-foreground">Valor da proposta</p>
        <p className="text-2xl font-bold text-foreground">
          {formatCurrency(proposalValue || 0)}
        </p>
        {clientName && <p className="text-xs text-muted-foreground">{clientName}</p>}
      </div>

      {/* Payment method selection */}
      {!paymentMethod && (
        <div className="grid grid-cols-1 gap-2">
          <Button variant="outline" className="justify-start gap-3 h-12" onClick={() => setPaymentMethod("pix")}>
            <QrCode className="h-5 w-5 text-green-600" />
            <div className="text-left">
              <p className="text-sm font-medium">PIX</p>
              <p className="text-[10px] text-muted-foreground">Pagamento instantâneo</p>
            </div>
          </Button>
          <Button variant="outline" className="justify-start gap-3 h-12" onClick={() => setPaymentMethod("cartao")}>
            <CreditCard className="h-5 w-5 text-blue-600" />
            <div className="text-left">
              <p className="text-sm font-medium">Cartão de Crédito</p>
              <p className="text-[10px] text-muted-foreground">Via Stripe (parcela até 12x)</p>
            </div>
          </Button>
          <Button variant="outline" className="justify-start gap-3 h-12" onClick={() => setPaymentMethod("boleto")}>
            <FileText className="h-5 w-5 text-amber-600" />
            <div className="text-left">
              <p className="text-sm font-medium">Boleto Bancário</p>
              <p className="text-[10px] text-muted-foreground">Upload do PDF da financeira</p>
            </div>
          </Button>
        </div>
      )}

      {/* PIX */}
      {paymentMethod === "pix" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <QrCode className="h-4 w-4 text-green-600" /> Pagamento via PIX
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-muted rounded-lg p-6 flex items-center justify-center">
              <div className="text-center space-y-2">
                <QrCode className="h-24 w-24 text-foreground mx-auto" />
                <p className="text-xs text-muted-foreground">QR Code PIX</p>
              </div>
            </div>
            <div>
              <Label className="text-xs">Chave PIX (copia e cola)</Label>
              <div className="flex gap-2 mt-1">
                <Input value={pixKey} readOnly className="h-8 text-xs" />
                <Button variant="outline" size="sm" onClick={handlePixCopy} className="gap-1">
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </Button>
              </div>
            </div>
            <Button className="w-full gap-2" onClick={handleConfirmPayment} disabled={processing}>
              <CheckCircle className="h-4 w-4" /> Confirmar Pagamento PIX
            </Button>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setPaymentMethod(null)}>
              ← Voltar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Card */}
      {paymentMethod === "cartao" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-600" /> Cartão de Crédito
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              O cliente será redirecionado para o checkout seguro do Stripe.
            </p>
            <Button className="w-full gap-2" onClick={handleStripeCheckout} disabled={processing}>
              <CreditCard className="h-4 w-4" /> {processing ? "Gerando link..." : "Gerar Link de Pagamento"}
            </Button>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setPaymentMethod(null)}>
              ← Voltar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Boleto */}
      {paymentMethod === "boleto" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-amber-600" /> Boleto Bancário
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Faça upload do boleto PDF gerado pela financeira.
            </p>
            <label className="cursor-pointer">
              <input type="file" accept=".pdf" className="hidden" onChange={handleBoletoUpload} />
              <Button variant="outline" className="w-full gap-2 pointer-events-none" asChild>
                <span>
                  <Upload className="h-4 w-4" /> {uploadingBoleto ? "Enviando..." : "Upload do Boleto PDF"}
                </span>
              </Button>
            </label>
            {boletoUrl && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded text-xs">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="flex-1 truncate">Boleto enviado</span>
                <Button variant="ghost" size="sm" className="h-6 text-xs"
                  onClick={() => window.open(boletoUrl, "_blank")}>
                  Ver
                </Button>
              </div>
            )}
            <Button className="w-full gap-2" onClick={handleConfirmPayment} disabled={processing || !boletoUrl}>
              <CheckCircle className="h-4 w-4" /> Confirmar Pagamento
            </Button>
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setPaymentMethod(null)}>
              ← Voltar
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
