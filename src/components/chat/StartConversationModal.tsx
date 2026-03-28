import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, UserCircle, MessageSquarePlus, Phone, Send } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface ClientOption {
  trackingId: string;
  clientName: string;
  contractNumber: string;
  status: string;
  vendedor: string | null;
  projetista: string | null;
  phone: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (trackingId: string, clientName: string, contractNumber: string) => void;
  tenantId: string | null;
  currentUserName: string | null;
  currentUserRole: string | null;
  currentUserId?: string | null;
  existingConversationIds: Set<string>;
}

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  em_negociacao: "Em Negociação",
  proposta_enviada: "Proposta Enviada",
  expirado: "Expirado",
  fechado: "Fechado",
  perdido: "Perdido",
};

export function StartConversationModal({
  open, onClose, onSelect, tenantId, currentUserName, currentUserRole, currentUserId, existingConversationIds,
}: Props) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [manualPhone, setManualPhone] = useState("");
  const [manualName, setManualName] = useState("");

  const isAdminOrManager = currentUserRole
    ? ["administrador", "gerente", "admin"].includes(currentUserRole.toLowerCase())
    : false;

  useEffect(() => {
    if (!open || !tenantId) return;
    setLoading(true);

    (async () => {
      // Fetch client_tracking records
      const { data: trackings } = await supabase
        .from("client_tracking")
        .select("id, nome_cliente, numero_contrato, status, projetista, client_id")
        .eq("tenant_id", tenantId)
        .in("status", ["novo", "em_negociacao", "proposta_enviada", "expirado", "fechado"])
        .order("updated_at", { ascending: false });

      if (!trackings || trackings.length === 0) {
        const { data: directClients } = await supabase
          .from("clients")
          .select("id, nome, numero_orcamento, status, vendedor, telefone")
          .eq("tenant_id", tenantId)
          .in("status", ["novo", "em_negociacao", "proposta_enviada", "expirado", "fechado"])
          .order("updated_at", { ascending: false });

        if (directClients && directClients.length > 0) {
          let options: ClientOption[] = (directClients as any[]).map((c) => ({
            trackingId: c.id,
            clientName: c.nome,
            contractNumber: c.numero_orcamento || "",
            status: c.status,
            vendedor: c.vendedor || null,
            projetista: null,
            phone: c.telefone || null,
          }));

          if (!isAdminOrManager && currentUserName) {
            const nameLower = currentUserName.toLowerCase();
            options = options.filter(c => c.vendedor?.toLowerCase() === nameLower);
          }

          setClients(options);
        } else {
          setClients([]);
        }
        setLoading(false);
        return;
      }

      const clientIds = [...new Set((trackings as any[]).map((t) => t.client_id).filter(Boolean))];
      let clientDataMap: Record<string, { vendedor: string | null; telefone: string | null }> = {};

      if (clientIds.length > 0) {
        const { data: clientsData } = await supabase
          .from("clients")
          .select("id, vendedor, telefone")
          .in("id", clientIds);

        if (clientsData) {
          (clientsData as any[]).forEach((c) => {
            clientDataMap[c.id] = { vendedor: c.vendedor, telefone: c.telefone || null };
          });
        }
      }

      const options: ClientOption[] = (trackings as any[]).map((t) => ({
        trackingId: t.id,
        clientName: t.nome_cliente,
        contractNumber: t.numero_contrato,
        status: t.status,
        vendedor: clientDataMap[t.client_id]?.vendedor || null,
        projetista: t.projetista || null,
        phone: clientDataMap[t.client_id]?.telefone || (t.numero_contrato?.startsWith("WA-") ? t.numero_contrato.replace("WA-", "") : null),
      }));

      let filtered = options;
      if (!isAdminOrManager && currentUserName) {
        const nameLower = currentUserName.toLowerCase();
        filtered = options.filter((c) =>
          c.vendedor?.toLowerCase() === nameLower ||
          c.projetista?.toLowerCase() === nameLower
        );
      }

      setClients(filtered);
      setLoading(false);
    })();
  }, [open, tenantId, isAdminOrManager, currentUserName]);

  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter(
      (c) => c.clientName.toLowerCase().includes(q) || c.contractNumber.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))
    );
  }, [clients, search]);

  const handleManualStart = () => {
    const phone = manualPhone.replace(/\D/g, "");
    if (phone.length < 10) return;
    const name = manualName.trim() || phone;
    const contractNumber = `WA-${phone}`;
    onSelect(contractNumber, name, contractNumber);
    setManualPhone("");
    setManualName("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquarePlus className="h-5 w-5 text-primary" />
            Iniciar Conversa
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="clients" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="clients" className="text-xs gap-1">
              <UserCircle className="h-3.5 w-3.5" /> Clientes
            </TabsTrigger>
            <TabsTrigger value="manual" className="text-xs gap-1">
              <Phone className="h-3.5 w-3.5" /> Novo Número
            </TabsTrigger>
          </TabsList>

          <TabsContent value="clients" className="flex-1 flex flex-col min-h-0 mt-2">
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente, contrato ou telefone..."
                className="pl-8 h-9 text-sm"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0 max-h-[50vh]">
              {loading ? (
                <p className="text-center text-sm text-muted-foreground py-8">Carregando clientes...</p>
              ) : filteredClients.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  {search ? "Nenhum cliente encontrado" : "Nenhum cliente disponível"}
                </p>
              ) : (
                filteredClients.map((c) => {
                  const hasConversation = existingConversationIds.has(c.trackingId);
                  return (
                    <button
                      key={c.trackingId}
                      onClick={() => onSelect(c.trackingId, c.clientName, c.contractNumber)}
                      className="w-full text-left px-3 py-2.5 rounded-md hover:bg-muted/80 transition-colors flex items-start gap-3 group"
                    >
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <UserCircle className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">{c.clientName}</span>
                          {hasConversation && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1">Ativa</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-muted-foreground">{c.contractNumber}</span>
                          <Badge variant="outline" className="text-[9px] h-4 px-1">
                            {STATUS_LABELS[c.status] || c.status}
                          </Badge>
                        </div>
                        {c.phone && (
                          <p className="text-[10px] text-emerald-600 mt-0.5 flex items-center gap-1">
                            <Phone className="h-2.5 w-2.5" /> {c.phone}
                          </p>
                        )}
                        {(c.vendedor || c.projetista) && isAdminOrManager && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {c.vendedor && `Vendedor: ${c.vendedor}`}
                            {c.vendedor && c.projetista && " • "}
                            {c.projetista && `Projetista: ${c.projetista}`}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </TabsContent>

          <TabsContent value="manual" className="mt-2 space-y-3">
            <p className="text-xs text-muted-foreground">
              Digite o número completo do WhatsApp (com DDD) para iniciar conversa com um contato que não está na lista.
            </p>
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Número WhatsApp *</label>
                <Input
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  placeholder="5511999998888"
                  className="h-9 text-sm"
                  type="tel"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Nome do contato (opcional)</label>
                <Input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Nome do cliente"
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <Button
              onClick={handleManualStart}
              disabled={manualPhone.replace(/\D/g, "").length < 10}
              className="w-full gap-2"
              size="sm"
            >
              <Send className="h-4 w-4" />
              Iniciar Conversa
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}