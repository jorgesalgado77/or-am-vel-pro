import { useState, useEffect, useRef } from "react";
import { usePersistedValue } from "@/hooks/usePersistedFormState";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Lightbulb, MessageSquareWarning, Paperclip, X, Send, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "sonner";

type TicketTipo = "erro" | "sugestao" | "reclamacao";

interface SupportTicket {
  id: string;
  tipo: string;
  mensagem: string;
  status: string;
  created_at: string;
  anexos_urls: string[];
}

const tipoLabels: Record<TicketTipo, string> = {
  erro: "Reportar Erro ou Problema",
  sugestao: "Enviar Sugestão",
  reclamacao: "Enviar Reclamação",
};

const tipoIcons: Record<TicketTipo, React.ReactNode> = {
  erro: <AlertTriangle className="h-5 w-5" />,
  sugestao: <Lightbulb className="h-5 w-5" />,
  reclamacao: <MessageSquareWarning className="h-5 w-5" />,
};

const statusColors: Record<string, string> = {
  aberto: "bg-yellow-100 text-yellow-800 border-yellow-300",
  em_andamento: "bg-blue-100 text-blue-800 border-blue-300",
  resolvido: "bg-green-100 text-green-800 border-green-300",
};

const statusLabels: Record<string, string> = {
  aberto: "Aberto",
  em_andamento: "Em Andamento",
  resolvido: "Resolvido",
};

interface SupportDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SupportDialog({ open, onClose }: SupportDialogProps) {
  const { settings } = useCompanySettings();
  const { currentUser } = useCurrentUser();
  const [tab, setTab] = useState<"novo" | "historico">("novo");
  const [selectedTipo, setSelectedTipo, clearTipo] = usePersistedValue<TicketTipo | null>("support-tipo", null);
  const [mensagem, setMensagem, clearMensagem] = usePersistedValue("support-mensagem", "");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && tab === "historico") fetchTickets();
  }, [open, tab]);

  const fetchTickets = async () => {
    if (!currentUser) return;
    setLoadingTickets(true);
    const { data } = await supabase
      .from("support_tickets")
      .select("id, tipo, mensagem, status, created_at, anexos_urls")
      .eq("usuario_id", currentUser.id)
      .order("created_at", { ascending: false });
    setTickets((data as SupportTicket[]) || []);
    setLoadingTickets(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSend = async () => {
    if (!selectedTipo || !mensagem.trim() || !currentUser) return;
    setSending(true);

    try {
      // Upload files
      const anexosUrls: string[] = [];
      for (const file of files) {
        const filePath = `${currentUser.id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("support-attachments")
          .upload(filePath, file);
        if (uploadError) {
          toast.error(`Erro ao enviar arquivo: ${file.name}`);
          continue;
        }
        const { data: urlData } = supabase.storage
          .from("support-attachments")
          .getPublicUrl(filePath);
        anexosUrls.push(urlData.publicUrl);
      }

      const { error } = await supabase.from("support_tickets").insert({
        tipo: selectedTipo,
        codigo_loja: settings.codigo_loja || "",
        nome_loja: settings.company_name || "",
        usuario_id: currentUser.id,
        usuario_nome: currentUser.nome_completo,
        usuario_email: currentUser.email || "",
        usuario_telefone: currentUser.telefone || "",
        mensagem: mensagem.trim(),
        anexos_urls: anexosUrls,
      });

      if (error) {
        toast.error("Erro ao enviar ticket de suporte");
      } else {
        toast.success("Ticket enviado com sucesso!");
        setSelectedTipo(null);
        setMensagem("");
        setFiles([]);
      }
    } catch {
      toast.error("Erro inesperado ao enviar ticket");
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Suporte</DialogTitle>
          <DialogDescription>Envie um ticket ou veja seu histórico.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "novo" | "historico")}>
          <TabsList className="w-full">
            <TabsTrigger value="novo" className="flex-1">Novo Ticket</TabsTrigger>
            <TabsTrigger value="historico" className="flex-1">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="novo">
            {!selectedTipo ? (
              <div className="space-y-3 mt-4">
                <p className="text-sm text-muted-foreground">Selecione o tipo de solicitação:</p>
                {(["erro", "sugestao", "reclamacao"] as TicketTipo[]).map((tipo) => (
                  <button
                    key={tipo}
                    onClick={() => setSelectedTipo(tipo)}
                    className="w-full flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:bg-accent transition-colors text-left"
                  >
                    <span className={
                      tipo === "erro" ? "text-destructive" :
                      tipo === "sugestao" ? "text-primary" :
                      "text-orange-500"
                    }>
                      {tipoIcons[tipo]}
                    </span>
                    <span className="font-medium text-sm text-foreground">{tipoLabels[tipo]}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4 mt-4">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">{tipoLabels[selectedTipo]}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedTipo(null)} className="text-xs">
                    ← Voltar
                  </Button>
                </div>

                {/* Auto-filled fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Código da Loja</Label>
                    <Input value={settings.codigo_loja || "—"} readOnly className="bg-muted text-xs h-8" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Nome da Loja</Label>
                    <Input value={settings.company_name || "—"} readOnly className="bg-muted text-xs h-8" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Usuário</Label>
                    <Input value={currentUser?.nome_completo || "—"} readOnly className="bg-muted text-xs h-8" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <Input value={currentUser?.email || "—"} readOnly className="bg-muted text-xs h-8" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs text-muted-foreground">Telefone</Label>
                    <Input value={currentUser?.telefone || "—"} readOnly className="bg-muted text-xs h-8" />
                  </div>
                </div>

                {/* Message */}
                <div>
                  <Label className="text-xs">Mensagem</Label>
                  <Textarea
                    value={mensagem}
                    onChange={(e) => setMensagem(e.target.value)}
                    placeholder="Descreva sua solicitação..."
                    className="min-h-[100px]"
                  />
                </div>

                {/* File attachments */}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.txt"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-2"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    Anexar Arquivo
                  </Button>
                  {files.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {files.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded px-2 py-1">
                          <Paperclip className="h-3 w-3 shrink-0" />
                          <span className="truncate flex-1">{f.name}</span>
                          <button onClick={() => removeFile(i)} className="hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={onClose}>Cancelar</Button>
                  <Button onClick={handleSend} disabled={!mensagem.trim() || sending} className="gap-2">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Salvar e Enviar
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="historico">
            <div className="mt-4 space-y-3">
              {loadingTickets ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : tickets.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum ticket enviado ainda.</p>
              ) : (
                tickets.map((ticket) => (
                  <div key={ticket.id} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">
                        {tipoLabels[ticket.tipo as TicketTipo] || ticket.tipo}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColors[ticket.status] || "bg-muted text-muted-foreground"}`}>
                        {statusLabels[ticket.status] || ticket.status}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{ticket.mensagem}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(ticket.created_at).toLocaleDateString("pt-BR")} às{" "}
                      {new Date(ticket.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    {ticket.anexos_urls && ticket.anexos_urls.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {ticket.anexos_urls.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                            Anexo {i + 1}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
