import { memo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Search, Phone, User, Loader2, MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

interface WhatsAppContact {
  name: string;
  phone: string;
  profilePicUrl?: string;
}

interface Props {
  tenantId: string | null;
  open: boolean;
  onClose: () => void;
  onStartChat?: (contact: WhatsAppContact) => void;
}

export const WhatsAppContactsList = memo(function WhatsAppContactsList({ tenantId, open, onClose, onStartChat }: Props) {
  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [imported, setImported] = useState(false);
  const [search, setSearch] = useState("");

  const importContacts = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);

    try {
      // Get WhatsApp settings
      const { data: settings } = await supabase
        .from("whatsapp_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      const s = settings as any;
      if (!s?.ativo) {
        toast.error("WhatsApp não configurado");
        setLoading(false);
        return;
      }

      let fetchedContacts: WhatsAppContact[] = [];

      if (s.provider === "zapi" && s.zapi_instance_id && s.zapi_token) {
        // Z-API paginated contacts fetch
        let page = 1;
        let hasMore = true;
        const baseUrl = `https://api.z-api.io/instances/${s.zapi_instance_id}/token/${s.zapi_token}`;
        const headers: Record<string, string> = {
          "Client-Token": s.zapi_client_token || "",
          ...(s.zapi_security_token ? { "Security-Token": s.zapi_security_token } : {}),
        };

        while (hasMore) {
          try {
            const res = await fetch(`${baseUrl}/contacts?page=${page}&pageSize=1000`, { headers });
            const data = await res.json().catch(() => []);
            const batch = Array.isArray(data) ? data : (data?.contacts || data?.results || []);
            if (!Array.isArray(batch) || batch.length === 0) {
              hasMore = false;
              break;
            }
            const mapped = batch
              .filter((c: any) => (c.name || c.notify || c.pushName) && (c.phone || c.id))
              .map((c: any) => ({
                name: c.name || c.notify || c.pushName || "Sem nome",
                phone: (c.phone || c.id || "").replace("@c.us", "").replace("@s.whatsapp.net", ""),
                profilePicUrl: c.imgUrl,
              }));
            fetchedContacts.push(...mapped);
            if (batch.length < 1000) {
              hasMore = false;
            } else {
              page++;
            }
          } catch {
            hasMore = false;
          }
        }
      } else if (s.provider === "evolution" && s.evolution_api_url && s.evolution_api_key) {
        const instanceName = s.evolution_instance_name || "default";
        const res = await fetch(
          `${s.evolution_api_url.replace(/\/$/, "")}/chat/findContacts/${instanceName}`,
          { method: "POST", headers: { apikey: s.evolution_api_key, "Content-Type": "application/json" }, body: JSON.stringify({}) }
        );
        const data = await res.json().catch(() => []);
        if (Array.isArray(data)) {
          fetchedContacts = data
            .filter((c: any) => c.pushName || c.id)
            .map((c: any) => ({
              name: c.pushName || c.id?.split("@")[0] || "Sem nome",
              phone: c.id?.replace("@s.whatsapp.net", "") || "",
            }));
        }
      } else {
        toast.error("Provedor WhatsApp não suportado para importação");
        setLoading(false);
        return;
      }

      setContacts(fetchedContacts);
      setImported(true);
      toast.success(`${fetchedContacts.length} contatos importados!`);
    } catch (err) {
      console.error("Import contacts error:", err);
      toast.error("Erro ao importar contatos do WhatsApp");
    }

    setLoading(false);
  }, [tenantId]);

  const filtered = search.trim()
    ? contacts.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search)
      )
    : contacts;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[85vh] sm:max-h-[80vh] flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4 text-primary" />
            Contatos do WhatsApp
          </DialogTitle>
        </DialogHeader>

        {!imported ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-sm text-muted-foreground text-center">
              Importe os contatos salvos na sua instância WhatsApp conectada.
            </p>
            <Button onClick={importContacts} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {loading ? "Importando..." : "Importar Contatos"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar contato..." className="pl-8 h-8 text-sm" />
              </div>
              <Badge variant="secondary" className="text-xs shrink-0">{filtered.length} contatos</Badge>
            </div>
            <ScrollArea className="flex-1 h-[50vh] sm:h-[55vh]">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum contato encontrado</p>
              ) : (
                <div className="space-y-1">
                  {filtered.map((c, i) => (
                    <div key={`${c.phone}-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors group">
                      <Avatar className="h-8 w-8 shrink-0">
                        {c.profilePicUrl ? (
                          <AvatarImage src={c.profilePicUrl} alt={c.name} />
                        ) : null}
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {c.name?.charAt(0)?.toUpperCase() || <User className="h-3.5 w-3.5" />}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{c.phone}</p>
                      </div>
                      {onStartChat && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={() => onStartChat(c)}
                          title="Iniciar conversa"
                        >
                          <MessageCircle className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
            <div className="flex justify-between pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => { setImported(false); setContacts([]); setSearch(""); }}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> Reimportar
              </Button>
              <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
});
