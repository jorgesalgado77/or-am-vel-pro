import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { CreditCard, QrCode, CheckCircle2, ArrowLeft, Sparkles, Shield, Zap } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { toast } from "sonner";

interface AddonPurchaseCardProps {
  addonName: string;
  addonSlug: string;
  price: string;
  description: string;
  features: string[];
  icon: React.ReactNode;
  onBack?: () => void;
}

export function AddonPurchaseCard({ addonName, addonSlug, price, description, features, icon, onBack }: AddonPurchaseCardProps) {
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card" | null>(null);
  const [processing, setProcessing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const tenantId = getTenantId();

  const handleConfirmPayment = async () => {
    if (!tenantId) { toast.error("Tenant não encontrado"); return; }
    setProcessing(true);

    // Simulate payment processing
    await new Promise(r => setTimeout(r, 2000));

    // Activate addon
    const { error } = await supabase
      .from(addonSlug === "vendazap_ai" ? "vendazap_addon" : "dealroom_addon" as any)
      .upsert({
        tenant_id: tenantId,
        ativo: true,
        max_mensagens_dia: addonSlug === "vendazap_ai" ? 50 : 0,
        activated_at: new Date().toISOString(),
      } as any, { onConflict: "tenant_id" });

    if (error) {
      console.error("Addon activation error:", error);
      toast.error("Erro ao ativar add-on. Tente novamente.");
      setProcessing(false);
      return;
    }

    setConfirmed(true);
    setProcessing(false);
    toast.success(`${addonName} ativado com sucesso! 🎉`);

    // Reload page after short delay
    setTimeout(() => window.location.reload(), 2000);
  };

  // Generate a fake PIX code for demonstration
  const pixCode = `00020126580014BR.GOV.BCB.PIX0136${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}5204000053039865802BR5925ORCAMOVEL PRO LTDA6009SAO PAULO62070503***6304`;

  if (confirmed) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center animate-in zoom-in">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        </div>
        <h3 className="text-xl font-bold text-foreground">Pagamento Confirmado!</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          O {addonName} foi ativado com sucesso. A página será recarregada em instantes...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-8 space-y-6 max-w-lg mx-auto">
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack} className="self-start gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      )}

      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        {icon}
      </div>

      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold text-foreground">{addonName}</h3>
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
      </div>

      <Card className="w-full">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Plano mensal</span>
            <div className="text-right">
              <span className="text-3xl font-bold text-foreground">{price}</span>
              <span className="text-sm text-muted-foreground">/mês</span>
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                <span className="text-foreground">{f}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button size="lg" className="w-full gap-2 h-12 text-base" onClick={() => setShowPayment(true)}>
        <Sparkles className="h-5 w-5" /> Contratar {addonName}
      </Button>

      {/* Payment Dialog */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" /> Pagamento Seguro
            </DialogTitle>
          </DialogHeader>

          {!paymentMethod ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Escolha a forma de pagamento:</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setPaymentMethod("pix")}
                  className="p-6 border-2 rounded-xl hover:border-primary transition-all text-center space-y-3 hover:bg-primary/5"
                >
                  <QrCode className="h-10 w-10 mx-auto text-emerald-600" />
                  <div>
                    <p className="font-semibold text-foreground">PIX</p>
                    <p className="text-xs text-muted-foreground">Aprovação instantânea</p>
                  </div>
                  <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200">5% OFF</Badge>
                </button>
                <button
                  onClick={() => setPaymentMethod("card")}
                  className="p-6 border-2 rounded-xl hover:border-primary transition-all text-center space-y-3 hover:bg-primary/5"
                >
                  <CreditCard className="h-10 w-10 mx-auto text-blue-600" />
                  <div>
                    <p className="font-semibold text-foreground">Cartão</p>
                    <p className="text-xs text-muted-foreground">Crédito ou débito</p>
                  </div>
                  <Badge variant="secondary">Até 3x</Badge>
                </button>
              </div>
            </div>
          ) : paymentMethod === "pix" ? (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setPaymentMethod(null)} className="gap-1">
                <ArrowLeft className="h-3 w-3" /> Voltar
              </Button>
              <div className="text-center space-y-3">
                <p className="text-sm font-medium text-foreground">Escaneie o QR Code ou copie o código PIX</p>
                {/* QR Code visual representation */}
                <div className="mx-auto w-48 h-48 bg-foreground/5 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                  <div className="grid grid-cols-8 gap-0.5 w-36 h-36">
                    {Array.from({ length: 64 }).map((_, i) => (
                      <div key={i} className={`w-full aspect-square rounded-sm ${Math.random() > 0.5 ? 'bg-foreground' : 'bg-background'}`} />
                    ))}
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-[10px] font-mono text-muted-foreground break-all leading-relaxed">
                    {pixCode.slice(0, 60)}...
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 gap-1 w-full"
                    onClick={() => { navigator.clipboard.writeText(pixCode); toast.success("Código PIX copiado!"); }}
                  >
                    Copiar código PIX
                  </Button>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Valor:</span>
                  <span className="font-bold text-foreground">{price}</span>
                </div>
              </div>
              <Button className="w-full gap-2" onClick={handleConfirmPayment} disabled={processing}>
                {processing ? (
                  <>
                    <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    Confirmando pagamento...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Confirmar Pagamento
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setPaymentMethod(null)} className="gap-1">
                <ArrowLeft className="h-3 w-3" /> Voltar
              </Button>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Número do Cartão</label>
                  <input className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-background" placeholder="0000 0000 0000 0000" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Validade</label>
                    <input className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-background" placeholder="MM/AA" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">CVV</label>
                    <input className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-background" placeholder="123" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Nome no Cartão</label>
                  <input className="w-full mt-1 px-3 py-2 border rounded-md text-sm bg-background" placeholder="NOME COMPLETO" />
                </div>
                <div className="flex items-center justify-between text-sm pt-2">
                  <span className="text-muted-foreground">Valor:</span>
                  <span className="font-bold text-foreground">{price}</span>
                </div>
              </div>
              <Button className="w-full gap-2" onClick={handleConfirmPayment} disabled={processing}>
                {processing ? (
                  <>
                    <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4" /> Pagar {price}
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
