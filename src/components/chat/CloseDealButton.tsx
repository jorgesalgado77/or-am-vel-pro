import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Handshake, Loader2, CreditCard, Send, Sparkles, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { logAudit } from "@/services/auditService";
import { AsaasBillingPanel } from "@/components/billing/AsaasBillingPanel";

interface Props {
  trackingId: string;
  clientName: string;
  tenantId: string | null;
  userId?: string;
  clientCpfCnpj?: string;
  clientEmail?: string;
  clientPhone?: string;
  onProposalSent?: (url: string | null) => void;
}

type View = "form" | "billing";

export function CloseDealButton({ trackingId, clientName, tenantId, userId, clientCpfCnpj, clientEmail, clientPhone, onProposalSent }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>("form");
  const [form, setForm] = useState({
    valor_proposta: "",
    descricao: "",
    forma_pagamento: "pix",
  });

  const valor = parseFloat(form.valor_proposta) || 0;

  const handleSubmit = async () => {
    if (!valor || valor <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    if (!tenantId) {
      toast.error("Tenant não encontrado");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("dealroom", {
        body: {
          action: "create_proposal",
          tenant_id: tenantId,
          transaction_data: {
            tracking_id: trackingId,
            usuario_id: userId,
            valor_proposta: valor,
            descricao: form.descricao || `Proposta para ${clientName}`,
            forma_pagamento: form.forma_pagamento,
          },
        },
      });

      if (error || data?.error) {
        toast.error(data?.error || "Erro ao criar proposta");
        setLoading(false);
        return;
      }

      const proposal = data?.proposal;
      const checkoutUrl = proposal?.stripe_checkout_url;

      const msgText = checkoutUrl
        ? `📋 *Proposta Comercial*\n\n💰 Valor: R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n📝 ${form.descricao || "Proposta comercial"}\n💳 Forma: ${form.forma_pagamento}\n\n🔗 Link para pagamento:\n${checkoutUrl}\n\n_Clique no link acima para finalizar o pagamento._`
        : `📋 *Proposta Comercial*\n\n💰 Valor: R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n📝 ${form.descricao || "Proposta comercial"}\n💳 Forma: ${form.forma_pagamento}\n\n_Aguardamos sua confirmação para prosseguir!_`;

      await supabase.from("tracking_messages").insert({
        tracking_id: trackingId,
        mensagem: msgText,
        remetente_tipo: "loja",
        remetente_nome: "📋 Proposta",
        lida: false,
        tenant_id: tenantId,
      } as any);

      logAudit({
        acao: "venda_fechada",
        entidade: "tracking",
        entidade_id: trackingId,
        usuario_id: userId || null,
        usuario_nome: null,
        tenant_id: tenantId,
        detalhes: { valor, forma: form.forma_pagamento, stripe: !!checkoutUrl },
      });

      toast.success("Proposta enviada com sucesso!");
      onProposalSent?.(checkoutUrl);

      // If PIX or Boleto, show billing panel
      if (form.forma_pagamento === "pix" || form.forma_pagamento === "boleto") {
        setView("billing");
      } else {
        setOpen(false);
        setForm({ valor_proposta: "", descricao: "", forma_pagamento: "pix" });
      }
    } catch (err) {
      console.error("Close deal error:", err);
      toast.error("Erro ao enviar proposta");
    }

    setLoading(false);
  };

  const handlePaymentConfirmed = (paymentId: string, method: string) => {
    toast.success(`Pagamento ${method} confirmado!`);
    setOpen(false);
    setView("form");
    setForm({ valor_proposta: "", descricao: "", forma_pagamento: "pix" });
  };

  const handleClose = () => {
    setOpen(false);
    setView("form");
  };

  return (
    <>
      <Button
        variant="default"
        size="sm"
        className="gap-1.5 text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
        onClick={() => setOpen(true)}
      >
        <Handshake className="h-3.5 w-3.5" />
        Fechar Pedido
      </Button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {view === "form" ? (
                <>
                  <Sparkles className="h-4 w-4 text-primary" />
                  Fechar Pedido — {clientName}
                </>
              ) : (
                <>
                  <Wallet className="h-4 w-4 text-primary" />
                  Cobrança — {clientName}
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {view === "form" && (
            <>
              <div className="space-y-4 py-2">
                <div>
                  <Label className="text-sm">Valor da Proposta (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.valor_proposta}
                    onChange={(e) => setForm({ ...form, valor_proposta: e.target.value })}
                    placeholder="0,00"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-sm">Descrição</Label>
                  <Textarea
                    value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                    placeholder="Detalhes da proposta..."
                    className="mt-1 min-h-[60px]"
                    maxLength={500}
                  />
                </div>

                <div>
                  <Label className="text-sm">Forma de Pagamento</Label>
                  <Select value={form.forma_pagamento} onValueChange={(v) => setForm({ ...form, forma_pagamento: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX (Asaas)</SelectItem>
                      <SelectItem value="boleto">Boleto (Asaas)</SelectItem>
                      <SelectItem value="cartao_credito">Cartão de Crédito (Stripe)</SelectItem>
                      <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                      <SelectItem value="financiamento">Financiamento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <CreditCard className="h-3.5 w-3.5" />
                    {form.forma_pagamento === "pix" || form.forma_pagamento === "boleto"
                      ? "Cobrança via Asaas"
                      : "Pagamento via Stripe"}
                  </div>
                  <p>
                    {form.forma_pagamento === "pix"
                      ? "Um QR Code PIX será gerado automaticamente via Asaas."
                      : form.forma_pagamento === "boleto"
                      ? "Um boleto bancário será gerado via Asaas."
                      : "Se configurado, um link de pagamento será gerado via Stripe."}
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={handleClose} disabled={loading}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={loading} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar Proposta
                </Button>
              </DialogFooter>
            </>
          )}

          {view === "billing" && tenantId && (
            <AsaasBillingPanel
              tenantId={tenantId}
              clientName={clientName}
              clientCpfCnpj={clientCpfCnpj || ""}
              clientEmail={clientEmail}
              clientPhone={clientPhone}
              valor={valor}
              descricao={form.descricao}
              onPaymentConfirmed={handlePaymentConfirmed}
              onBack={() => setView("form")}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
