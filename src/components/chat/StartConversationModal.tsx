import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, UserCircle, MessageSquarePlus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface ClientOption {
  trackingId: string;
  clientName: string;
  contractNumber: string;
  status: string;
  vendedor: string | null;
  projetista: string | null;
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
  fechado: "Fechado",
  perdido: "Perdido",
};

export function StartConversationModal({
  open, onClose, onSelect, tenantId, currentUserName, currentUserRole, currentUserId, existingConversationIds,
}: Props) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const isAdminOrManager = currentUserRole
    ? ["administrador", "gerente", "admin"].includes(currentUserRole.toLowerCase())
    : false;

  useEffect(() => {
    if (!open || !tenantId) return;
    setLoading(true);

    (async () => {
      // Fetch client_tracking with client info
      const { data: trackings } = await supabase
        .from("client_tracking")
        .select("id, nome_cliente, numero_contrato, status, projetista, client_id")
        .eq("tenant_id", tenantId)
        .in("status", ["novo", "em_negociacao", "proposta_enviada", "fechado"])
        .order("updated_at", { ascending: false });

      if (!trackings) { setLoading(false); return; }

      // Fetch clients to get vendedor info and vendedor_id for role filtering
      const clientIds = [...new Set((trackings as any[]).map((t) => t.client_id).filter(Boolean))];
      let vendedorMap: Record<string, { vendedor: string | null; vendedor_id: string | null }> = {};

      if (clientIds.length > 0) {
        const { data: clientsData } = await supabase
          .from("clients")
          .select("id, vendedor, vendedor_id")
          .in("id", clientIds);

        if (clientsData) {
          (clientsData as any[]).forEach((c) => {
            vendedorMap[c.id] = { vendedor: c.vendedor, vendedor_id: c.vendedor_id };
          });
        }
      }

      const options: ClientOption[] = (trackings as any[]).map((t) => ({
        trackingId: t.id,
        clientName: t.nome_cliente,
        contractNumber: t.numero_contrato,
        status: t.status,
        vendedor: vendedorMap[t.client_id]?.vendedor || null,
        projetista: t.projetista || null,
        vendedor_id: vendedorMap[t.client_id]?.vendedor_id || null,
        client_id: t.client_id,
      }));

      // Filter by role: vendedor/projetista only see their own clients
      let filtered = options;
      if (!isAdminOrManager) {
        if (currentUserId) {
          // Filter by vendedor_id (reliable)
          filtered = options.filter((c) => (c as any).vendedor_id === currentUserId);
        } else if (currentUserName) {
          // Fallback to name matching
          const nameLower = currentUserName.toLowerCase();
          filtered = options.filter((c) =>
            c.vendedor?.toLowerCase() === nameLower ||
            c.projetista?.toLowerCase() === nameLower
          );
        }
      }

      setClients(filtered);
      setLoading(false);
    })();
  }, [open, tenantId, isAdminOrManager, currentUserName]);

  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter(
      (c) => c.clientName.toLowerCase().includes(q) || c.contractNumber.toLowerCase().includes(q)
    );
  }, [clients, search]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquarePlus className="h-5 w-5 text-primary" />
            Iniciar Conversa
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente ou contrato..."
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
      </DialogContent>
    </Dialog>
  );
}
