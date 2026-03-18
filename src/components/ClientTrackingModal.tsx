import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Search, Send, Ruler, ShieldCheck, Truck, Wrench, Headphones, CheckCircle2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

const TRACKING_STEPS = [
  { key: "medicao", label: "Medição", icon: Ruler, color: "text-blue-500", bgActive: "bg-blue-500", bgInactive: "bg-muted" },
  { key: "liberacao", label: "Liberação Técnica", icon: ShieldCheck, color: "text-yellow-500", bgActive: "bg-yellow-500", bgInactive: "bg-muted" },
  { key: "entrega", label: "Entrega", icon: Truck, color: "text-purple-500", bgActive: "bg-purple-500", bgInactive: "bg-muted" },
  { key: "montagem", label: "Montagem", icon: Wrench, color: "text-orange-500", bgActive: "bg-orange-500", bgInactive: "bg-muted" },
  { key: "assistencia", label: "Ass.Técnica", icon: Headphones, color: "text-red-500", bgActive: "bg-red-500", bgInactive: "bg-muted" },
  { key: "finalizado", label: "Finalizado", icon: CheckCircle2, color: "text-green-500", bgActive: "bg-green-500", bgInactive: "bg-muted" },
];

interface TrackingData {
  id: string;
  numero_contrato: string;
  nome_cliente: string;
  cpf_cnpj: string | null;
  quantidade_ambientes: number;
  valor_contrato: number;
  data_fechamento: string | null;
  projetista: string | null;
  status: string;
}

interface Message {
  id: string;
  mensagem: string;
  remetente_tipo: string;
  remetente_nome: string | null;
  created_at: string;
  lida: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ClientTrackingModal({ open, onClose }: Props) {
  const [step, setStep] = useState<"lookup" | "tracking">("lookup");
  const [contractNumber, setContractNumber] = useState("");
  const [searching, setSearching] = useState(false);
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setStep("lookup");
      setContractNumber("");
      setTracking(null);
      setMessages([]);
    }
  }, [open]);

  // Realtime: auto-load new messages from loja
  useEffect(() => {
    if (!tracking) return;
    const channel = supabase
      .channel(`client-tracking-${tracking.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tracking_messages" },
        (payload) => {
          const msg = payload.new as any;
          if (msg.tracking_id === tracking.id && msg.remetente_tipo === "loja") {
            setMessages((prev) => [...prev, msg]);
            toast.info("Nova resposta da loja!");
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tracking]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSearch = async () => {
    if (!contractNumber.trim()) { toast.error("Informe o número do contrato"); return; }
    setSearching(true);
    const { data, error } = await supabase
      .from("client_tracking")
      .select("*")
      .eq("numero_contrato", contractNumber.trim())
      .limit(1)
      .single();

    if (error || !data) {
      toast.error("Contrato não encontrado");
      setSearching(false);
      return;
    }

    setTracking(data as any);
    await fetchMessages((data as any).id);
    setStep("tracking");
    setSearching(false);
  };

  const fetchMessages = async (trackingId: string) => {
    const { data } = await supabase
      .from("tracking_messages")
      .select("*")
      .eq("tracking_id", trackingId)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as any);

    // Mark client messages as read (from loja perspective, mark loja messages as read for client)
    await supabase
      .from("tracking_messages")
      .update({ lida: true } as any)
      .eq("tracking_id", trackingId)
      .eq("remetente_tipo", "loja")
      .eq("lida", false);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !tracking) return;
    setSending(true);
    const { error } = await supabase.from("tracking_messages").insert({
      tracking_id: tracking.id,
      mensagem: newMessage.trim(),
      remetente_tipo: "cliente",
      remetente_nome: tracking.nome_cliente,
      lida: false,
    } as any);
    if (error) toast.error("Erro ao enviar mensagem");
    else {
      setNewMessage("");
      await fetchMessages(tracking.id);
    }
    setSending(false);
  };

  const getStepIndex = (status: string) => TRACKING_STEPS.findIndex((s) => s.key === status);
  const currentStepIdx = tracking ? getStepIndex(tracking.status) : -1;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={step === "tracking" ? "max-w-2xl max-h-[90vh] overflow-y-auto" : "max-w-sm"}>
        {step === "lookup" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Search className="h-5 w-5 text-primary" />
                Acompanhe seu Projeto
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Número do Contrato</Label>
                <Input
                  value={contractNumber}
                  onChange={(e) => setContractNumber(e.target.value)}
                  placeholder="Informe o número do contrato"
                  className="mt-1"
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              </div>
              <Button onClick={handleSearch} disabled={searching} className="w-full gap-2">
                <Search className="h-4 w-4" />
                {searching ? "Buscando..." : "Consultar"}
              </Button>
            </div>
          </>
        ) : tracking ? (
          <>
            <DialogHeader>
              <DialogTitle>Acompanhamento do Projeto</DialogTitle>
            </DialogHeader>

            {/* Header info */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div><span className="text-muted-foreground">Cliente:</span> <strong>{tracking.nome_cliente}</strong></div>
                <div><span className="text-muted-foreground">CPF/CNPJ:</span> <strong>{tracking.cpf_cnpj || "—"}</strong></div>
                <div><span className="text-muted-foreground">Contrato:</span> <strong className="font-mono">{tracking.numero_contrato}</strong></div>
                <div><span className="text-muted-foreground">Ambientes:</span> <strong>{tracking.quantidade_ambientes}</strong></div>
                <div><span className="text-muted-foreground">Valor:</span> <strong>{Number(tracking.valor_contrato).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div>
                <div><span className="text-muted-foreground">Fechamento:</span> <strong>{tracking.data_fechamento ? format(new Date(tracking.data_fechamento), "dd/MM/yyyy") : "—"}</strong></div>
              </div>
            </div>

            {/* Tracking steps */}
            <div className="py-4">
              <div className="flex items-center justify-between relative">
                {/* Progress line */}
                <div className="absolute top-5 left-0 right-0 h-1 bg-muted rounded-full" />
                <div
                  className="absolute top-5 left-0 h-1 bg-green-500 rounded-full transition-all duration-500"
                  style={{ width: `${currentStepIdx >= 0 ? (currentStepIdx / (TRACKING_STEPS.length - 1)) * 100 : 0}%` }}
                />

                {TRACKING_STEPS.map((s, i) => {
                  const isActive = i <= currentStepIdx;
                  const isCurrent = i === currentStepIdx;
                  const Icon = s.icon;
                  return (
                    <div key={s.key} className="flex flex-col items-center gap-1 z-10 relative">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${isActive ? s.bgActive + " text-white" : "bg-muted text-muted-foreground"} ${isCurrent ? "ring-2 ring-offset-2 ring-primary scale-110" : ""}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className={`text-[10px] text-center leading-tight max-w-[60px] ${isActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Messages */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Mensagens</h4>
              <div className="border rounded-lg p-3 h-48 overflow-y-auto space-y-2 bg-background">
                {messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhuma mensagem ainda. Envie sua dúvida!</p>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.remetente_tipo === "cliente" ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${msg.remetente_tipo === "cliente" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                        <p className="text-[10px] opacity-70 mb-0.5">
                          {msg.remetente_nome || (msg.remetente_tipo === "loja" ? "Loja" : "Você")} • {format(new Date(msg.created_at), "dd/MM HH:mm")}
                        </p>
                        <p>{msg.mensagem}</p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="flex gap-2">
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  className="min-h-[40px] h-10 resize-none"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                />
                <Button onClick={handleSendMessage} disabled={sending || !newMessage.trim()} size="icon" className="shrink-0">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
