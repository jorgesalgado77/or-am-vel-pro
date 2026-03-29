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
      // Also fetch usuarios to resolve responsavel_id → name
      const [trackingsRes, directClientsRes, usuariosRes] = await Promise.all([
        supabase
          .from("client_tracking")
          .select("id, nome_cliente, numero_contrato, status, projetista, client_id")
          .eq("tenant_id", tenantId)
          .in("status", ["novo", "em_negociacao", "proposta_enviada", "expirado", "fechado"])
          .order("updated_at", { ascending: false }),
        supabase
          .from("clients")
          .select("id, nome, numero_orcamento, status, vendedor, telefone, responsavel_id")
          .eq("tenant_id", tenantId)
          .in("status", ["novo", "em_negociacao", "proposta_enviada", "expirado", "fechado"])
          .order("updated_at", { ascending: false }),
        supabase
          .from("usuarios")
          .select("id, auth_user_id, nome_completo")
          .eq("tenant_id", tenantId)
          .eq("ativo", true),
      ]);

      const trackings = trackingsRes.data as any[] || [];
      const directClients = directClientsRes.data as any[] || [];
      const usuarios = usuariosRes.data as any[] || [];

      // Build user lookup for responsavel_id
      const userMap = new Map<string, string>();
      for (const u of usuarios) {
        if (u.id) userMap.set(u.id, u.nome_completo);
        if (u.auth_user_id) userMap.set(u.auth_user_id, u.nome_completo);
      }

      const clientsById = new Map(directClients.map((c: any) => [c.id, c]));

      if (trackings.length === 0 && directClients.length > 0) {
        let options: ClientOption[] = directClients.map((c: any) => {
          const sellerName = c.vendedor || (c.responsavel_id ? userMap.get(c.responsavel_id) : null) || null;
          return {
            trackingId: c.id,
            clientName: c.nome,
            contractNumber: c.numero_orcamento || "",
            status: c.status,
            vendedor: sellerName,
            projetista: null,
            phone: c.telefone || null,
          };
        });

        if (!isAdminOrManager && currentUserName) {
          const nameLower = currentUserName.toLowerCase();
          options = options.filter(c =>
            c.vendedor?.toLowerCase() === nameLower ||
            c.projetista?.toLowerCase() === nameLower
          );
        }

        setClients(options);
        setLoading(false);
        return;
      }

      const options: ClientOption[] = trackings.map((t: any) => {
        const client = clientsById.get(t.client_id);
        const sellerName = client?.vendedor || (client?.responsavel_id ? userMap.get(client.responsavel_id) : null) || null;
        return {
          trackingId: t.id,
          clientName: t.nome_cliente,
          contractNumber: t.numero_contrato,
          status: t.status,
          vendedor: sellerName,
          projetista: t.projetista || null,
          phone: client?.telefone || (t.numero_contrato?.startsWith("WA-") ? t.numero_contrato.replace("WA-", "") : null),
        };
      });

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
                        {(c.vendedor || c.projetista) && (
                          <p className="text-[10px] mt-0.5">
                            {c.vendedor && (
                              <Badge variant="secondary" className="text-[8px] h-3.5 px-1 mr-1">
                                👤 {c.vendedor}
                              </Badge>
                            )}
                            {c.projetista && c.projetista !== c.vendedor && (
                              <Badge variant="outline" className="text-[8px] h-3.5 px-1">
                                📐 {c.projetista}
                              </Badge>
                            )}
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