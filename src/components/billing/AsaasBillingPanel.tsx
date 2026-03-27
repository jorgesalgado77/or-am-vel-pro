import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  QrCode, FileText, CheckCircle, Copy, Loader2, ArrowLeft, RefreshCw,
} from "lucide-react";
import { formatCurrency } from "@/lib/financing";
import { useAsaasBilling } from "@/hooks/useIntegrations";
import { toast } from "sonner";

interface AsaasBillingPanelProps {
  tenantId: string;
  clientName: string;
  clientCpfCnpj: string;
  clientEmail?: string;
  clientPhone?: string;
  valor: number;
  descricao?: string;
  onPaymentConfirmed?: (paymentId: string, method: string) => void;
  onBack?: () => void;
}

type Step = "select" | "processing" | "awaiting";

export function AsaasBillingPanel({
  tenantId, clientName, clientCpfCnpj, clientEmail, clientPhone,
  valor, descricao, onPaymentConfirmed, onBack,
}: AsaasBillingPanelProps) {
  const { createCustomer, createPayment, getPixQR, getPayment } = useAsaasBilling(tenantId);

  const [step, setStep] = useState<Step>("select");
  const [method, setMethod] = useState<"PIX" | "BOLETO" | null>(null);
  const [loading, setLoading] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [pixData, setPixData] = useState<{ qrCode?: string; payload?: string } | null>(null);
  const [boletoUrl, setBoletoUrl] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const handleGenerate = async (type: "PIX" | "BOLETO") => {
    setMethod(type);
    setLoading(true);
    setStep("processing");

    try {
      // 1. Create or find customer
      const customer = await createCustomer({
        name: clientName,
        cpfCnpj: clientCpfCnpj.replace(/\D/g, ""),
        email: clientEmail,
        phone: clientPhone,
      });

      if (!customer?.id) {
        setStep("select");
        setLoading(false);
        return;
      }

      // 2. Create payment
      const payment = await createPayment({
        customer_id: customer.id,
        value: valor,
        billing_type: type,
        description: descricao || `Venda - ${clientName}`,
        client_name: clientName,
        client_email: clientEmail,
        client_cpf_cnpj: clientCpfCnpj.replace(/\D/g, ""),
      });

      if (!payment?.id) {
        setStep("select");
        setLoading(false);
        return;
      }

      setPaymentId(payment.id);

      // 3. Get PIX QR or boleto URL
      if (type === "PIX") {
        const qr = await getPixQR(payment.id);
        setPixData({
          qrCode: qr?.encodedImage ? `data:image/png;base64,${qr.encodedImage}` : undefined,
          payload: qr?.payload,
        });
      } else {
        setBoletoUrl(payment.bankSlipUrl || payment.invoiceUrl || null);
      }

      setStep("awaiting");
    } catch (err) {
      console.error("Asaas billing error:", err);
      toast.error("Erro ao gerar cobrança");
      setStep("select");
    }

    setLoading(false);
  };

  const handleCopyPix = () => {
    if (pixData?.payload) {
      navigator.clipboard.writeText(pixData.payload);
      toast.success("Código PIX copiado!");
    }
  };

  const handleCheckStatus = async () => {
    if (!paymentId) return;
    setChecking(true);

    const payment = await getPayment(paymentId);
    if (payment?.status === "RECEIVED" || payment?.status === "CONFIRMED") {
      toast.success("Pagamento confirmado!");
      onPaymentConfirmed?.(paymentId, method || "PIX");
    } else {
      toast.info(`Status atual: ${payment?.status || "PENDING"}`);
    }

    setChecking(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center pb-3 border-b border-border">
        <p className="text-xs text-muted-foreground">Valor da cobrança</p>
        <p className="text-2xl font-bold text-foreground">{formatCurrency(valor)}</p>
        <p className="text-xs text-muted-foreground">{clientName}</p>
      </div>

      {/* Step: Select method */}
      {step === "select" && (
        <div className="grid gap-2">
          <Button
            variant="outline"
            className="justify-start gap-3 h-14"
            onClick={() => handleGenerate("PIX")}
          >
            <QrCode className="h-5 w-5 text-emerald-500" />
            <div className="text-left">
              <p className="text-sm font-medium">PIX via Asaas</p>
              <p className="text-[10px] text-muted-foreground">QR Code gerado automaticamente</p>
            </div>
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-3 h-14"
            onClick={() => handleGenerate("BOLETO")}
          >
            <FileText className="h-5 w-5 text-amber-500" />
            <div className="text-left">
              <p className="text-sm font-medium">Boleto Bancário</p>
              <p className="text-[10px] text-muted-foreground">Boleto gerado via Asaas</p>
            </div>
          </Button>
          {onBack && (
            <Button variant="ghost" size="sm" className="mt-2 gap-1.5" onClick={onBack}>
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar
            </Button>
          )}
        </div>
      )}

      {/* Step: Processing */}
      {step === "processing" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Gerando {method === "PIX" ? "QR Code PIX" : "boleto"}...
          </p>
        </div>
      )}

      {/* Step: Awaiting payment — PIX */}
      {step === "awaiting" && method === "PIX" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <QrCode className="h-4 w-4 text-emerald-500" />
              PIX Gerado
              <Badge variant="outline" className="ml-auto text-[10px]">Aguardando</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pixData?.qrCode && (
              <div className="bg-muted rounded-lg p-4 flex justify-center">
                <img src={pixData.qrCode} alt="QR Code PIX" className="h-40 w-40" />
              </div>
            )}

            {pixData?.payload && (
              <div>
                <Label className="text-xs">Copia e Cola</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={pixData.payload}
                    readOnly
                    className="h-8 text-xs font-mono"
                  />
                  <Button variant="outline" size="sm" onClick={handleCopyPix} className="gap-1 shrink-0">
                    <Copy className="h-3.5 w-3.5" /> Copiar
                  </Button>
                </div>
              </div>
            )}

            <Button
              className="w-full gap-2"
              onClick={handleCheckStatus}
              disabled={checking}
            >
              {checking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Verificar Pagamento
            </Button>

            <Button variant="ghost" size="sm" className="w-full gap-1.5" onClick={() => { setStep("select"); setPixData(null); }}>
              <ArrowLeft className="h-3.5 w-3.5" /> Escolher outro método
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step: Awaiting payment — Boleto */}
      {step === "awaiting" && method === "BOLETO" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-amber-500" />
              Boleto Gerado
              <Badge variant="outline" className="ml-auto text-[10px]">Aguardando</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-muted rounded-lg p-4 text-center space-y-2">
              <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto" />
              <p className="text-sm font-medium">Boleto criado com sucesso</p>
              <p className="text-xs text-muted-foreground">
                Envie o link abaixo para o cliente
              </p>
            </div>

            {boletoUrl && (
              <div>
                <Label className="text-xs">Link do Boleto</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={boletoUrl} readOnly className="h-8 text-xs" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(boletoUrl);
                      toast.success("Link copiado!");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copiar
                  </Button>
                </div>
              </div>
            )}

            {boletoUrl && (
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => window.open(boletoUrl, "_blank")}
              >
                <FileText className="h-4 w-4" /> Abrir Boleto
              </Button>
            )}

            <Button
              className="w-full gap-2"
              onClick={handleCheckStatus}
              disabled={checking}
            >
              {checking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Verificar Pagamento
            </Button>

            <Button variant="ghost" size="sm" className="w-full gap-1.5" onClick={() => { setStep("select"); setBoletoUrl(null); }}>
              <ArrowLeft className="h-3.5 w-3.5" /> Escolher outro método
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
