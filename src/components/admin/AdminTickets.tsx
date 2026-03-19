import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  MessageSquare, RefreshCw, Eye, Send, Clock, CheckCircle2, XCircle,
  AlertTriangle, Lightbulb, Bug, ChevronLeft, Paperclip, Sparkles, ShoppingBag,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SupportTicket {
  id: string;
  tipo: string;
  status: string;
  mensagem: string;
  usuario_nome: string;
  usuario_email: string | null;
  usuario_telefone: string | null;
  nome_loja: string | null;
  codigo_loja: string | null;
  anexos_urls: string[] | null;
  created_at: string;
  updated_at: string;
  resposta_admin?: string | null;
  respondido_em?: string | null;
  respondido_por?: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive"; icon: typeof Clock }> = {
  aberto: { label: "Aberto", variant: "destructive", icon: Clock },
  em_andamento: { label: "Em Andamento", variant: "default", icon: AlertTriangle },
  resolvido: { label: "Resolvido", variant: "secondary", icon: CheckCircle2 },
  fechado: { label: "Fechado", variant: "secondary", icon: XCircle },
};

const TIPO_CONFIG: Record<string, { label: string; icon: typeof Bug }> = {
  erro: { label: "Erro", icon: Bug },
  sugestao: { label: "Sugestão", icon: Lightbulb },
  reclamacao: { label: "Reclamação", icon: AlertTriangle },
  addon_interesse: { label: "Interesse Add-on", icon: ShoppingBag },
};

interface AdminTicketsProps {
  adminName: string;
}

export function AdminTickets({ adminName }: AdminTicketsProps) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [resposta, setResposta] = useState("");
  const [novoStatus, setNovoStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterCategory, setFilterCategory] = useState<"todos" | "suporte" | "addon">("todos");

  const fetchTickets = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar tickets");
    else setTickets((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchTickets(); }, []);

  const categoryFiltered = filterCategory === "todos"
    ? tickets
    : filterCategory === "addon"
      ? tickets.filter(t => t.tipo === "addon_interesse")
      : tickets.filter(t => t.tipo !== "addon_interesse");

  const filteredTickets = filterStatus === "todos"
    ? categoryFiltered
    : categoryFiltered.filter(t => t.status === filterStatus);

  const countByStatus = (status: string) => categoryFiltered.filter(t => t.status === status).length;
  const countAddon = tickets.filter(t => t.tipo === "addon_interesse").length;
  const countSuporte = tickets.filter(t => t.tipo !== "addon_interesse").length;

  const openTicket = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setResposta((ticket as any).resposta_admin || "");
    setNovoStatus(ticket.status);
  };

  const handleResponder = async () => {
    if (!selectedTicket) return;
    setSaving(true);

    const updatePayload: Record<string, any> = {
      status: novoStatus,
    };

    if (resposta.trim()) {
      updatePayload.resposta_admin = resposta.trim();
      updatePayload.respondido_em = new Date().toISOString();
      updatePayload.respondido_por = adminName;
    }

    const { error } = await supabase
      .from("support_tickets")
      .update(updatePayload)
      .eq("id", selectedTicket.id);

    if (error) {
      toast.error("Erro ao atualizar ticket");
    } else {
      toast.success("Ticket atualizado!");
      setSelectedTicket(null);
      fetchTickets();
    }
    setSaving(false);
  };

  const countByStatus = (status: string) => tickets.filter(t => t.status === status).length;

  // Detail view
  if (selectedTicket) {
    const statusCfg = STATUS_CONFIG[selectedTicket.status] || STATUS_CONFIG.aberto;
    const tipoCfg = TIPO_CONFIG[selectedTicket.tipo] || TIPO_CONFIG.erro;
    const TipoIcon = tipoCfg.icon;

    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedTicket(null)} className="gap-2">
          <ChevronLeft className="h-4 w-4" /> Voltar aos tickets
        </Button>

        <div className="grid md:grid-cols-3 gap-4">
          {/* Main content */}
          <Card className="md:col-span-2">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <TipoIcon className="h-5 w-5 text-muted-foreground" />
                  <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                  <Badge variant="outline">{tipoCfg.label}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(selectedTicket.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </p>
              </div>

              <div className="bg-muted/30 rounded-lg p-4">
                <p className="text-sm text-foreground whitespace-pre-wrap">{selectedTicket.mensagem}</p>
              </div>

              {selectedTicket.anexos_urls && selectedTicket.anexos_urls.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Paperclip className="h-3 w-3" /> Anexos ({selectedTicket.anexos_urls.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedTicket.anexos_urls.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary underline hover:text-primary/80"
                      >
                        Anexo {i + 1}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {(selectedTicket as any).resposta_admin && (
                <div className="border-t border-border pt-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Resposta do Admin — {(selectedTicket as any).respondido_por || "Admin"}{" "}
                    em {(selectedTicket as any).respondido_em
                      ? format(new Date((selectedTicket as any).respondido_em), "dd/MM/yyyy HH:mm", { locale: ptBR })
                      : ""}
                  </p>
                  <div className="bg-primary/5 rounded-lg p-4">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{(selectedTicket as any).resposta_admin}</p>
                  </div>
                </div>
              )}

              {/* Reply form */}
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-sm font-medium text-foreground">Responder</p>
                <Textarea
                  value={resposta}
                  onChange={(e) => setResposta(e.target.value)}
                  placeholder="Digite sua resposta ao ticket..."
                  rows={4}
                />
                <div className="flex items-center gap-3">
                  <Select value={novoStatus} onValueChange={setNovoStatus}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Alterar status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aberto">Aberto</SelectItem>
                      <SelectItem value="em_andamento">Em Andamento</SelectItem>
                      <SelectItem value="resolvido">Resolvido</SelectItem>
                      <SelectItem value="fechado">Fechado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={handleResponder} disabled={saving} className="gap-2">
                    <Send className="h-4 w-4" />
                    {saving ? "Salvando..." : "Enviar Resposta"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sidebar info */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <h4 className="text-sm font-semibold text-foreground">Informações</h4>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Usuário</p>
                  <p className="font-medium text-foreground">{selectedTicket.usuario_nome}</p>
                </div>
                {selectedTicket.usuario_email && (
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-foreground">{selectedTicket.usuario_email}</p>
                  </div>
                )}
                {selectedTicket.usuario_telefone && (
                  <div>
                    <p className="text-xs text-muted-foreground">Telefone</p>
                    <p className="text-foreground">{selectedTicket.usuario_telefone}</p>
                  </div>
                )}
                {selectedTicket.nome_loja && (
                  <div>
                    <p className="text-xs text-muted-foreground">Loja</p>
                    <p className="text-foreground">{selectedTicket.nome_loja}</p>
                  </div>
                )}
                {selectedTicket.codigo_loja && (
                  <div>
                    <p className="text-xs text-muted-foreground">Código da Loja</p>
                    <p className="text-foreground">{selectedTicket.codigo_loja}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Criado em</p>
                  <p className="text-foreground">
                    {format(new Date(selectedTicket.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Tickets de Suporte</h3>
        <div className="flex gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos ({tickets.length})</SelectItem>
              <SelectItem value="aberto">Abertos ({countByStatus("aberto")})</SelectItem>
              <SelectItem value="em_andamento">Em Andamento ({countByStatus("em_andamento")})</SelectItem>
              <SelectItem value="resolvido">Resolvidos ({countByStatus("resolvido")})</SelectItem>
              <SelectItem value="fechado">Fechados ({countByStatus("fechado")})</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchTickets} className="gap-2">
            <RefreshCw className="h-3 w-3" /> Atualizar
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Abertos", count: countByStatus("aberto"), color: "text-destructive" },
          { label: "Em Andamento", count: countByStatus("em_andamento"), color: "text-primary" },
          { label: "Resolvidos", count: countByStatus("resolvido"), color: "text-muted-foreground" },
          { label: "Total", count: tickets.length, color: "text-foreground" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Usuário / Loja</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="w-16">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Carregando...</TableCell>
                </TableRow>
              ) : filteredTickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum ticket encontrado
                  </TableCell>
                </TableRow>
              ) : filteredTickets.map((ticket) => {
                const statusCfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.aberto;
                const tipoCfg = TIPO_CONFIG[ticket.tipo] || TIPO_CONFIG.erro;
                const TipoIcon = tipoCfg.icon;
                return (
                  <TableRow key={ticket.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openTicket(ticket)}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <TipoIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">{tipoCfg.label}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium text-foreground">{ticket.usuario_nome}</p>
                        <p className="text-xs text-muted-foreground">{ticket.nome_loja || "—"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-muted-foreground truncate max-w-[250px]">{ticket.mensagem}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusCfg.variant} className="text-xs">{statusCfg.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(ticket.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
