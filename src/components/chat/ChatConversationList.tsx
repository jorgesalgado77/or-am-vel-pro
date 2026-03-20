import { memo, useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEMPERATURE_CONFIG } from "@/lib/leadTemperature";
import type { ChatConversation } from "./types";

interface Props {
  conversations: ChatConversation[];
  selectedId: string | null;
  onSelect: (conv: ChatConversation) => void;
  loading: boolean;
}

function timeAgo(dateStr?: string) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export const ChatConversationList = memo(function ChatConversationList({ conversations, selectedId, onSelect, loading }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(
      (c) => c.nome_cliente.toLowerCase().includes(q) || c.numero_contrato.toLowerCase().includes(q)
    );
  }, [conversations, search]);

  return (
    <div className="flex flex-col h-full border-r border-border bg-card">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          Conversas
        </h3>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {search ? "Nenhum resultado" : "Nenhuma conversa"}
          </div>
        ) : (
          filtered.map((conv) => {
            const tempConfig = conv.lead_temperature ? TEMPERATURE_CONFIG[conv.lead_temperature] : null;
            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv)}
                className={cn(
                  "w-full text-left px-3 py-2.5 border-b border-border/50 transition-colors duration-100",
                  selectedId === conv.id
                    ? "bg-primary/8"
                    : "hover:bg-muted/50 active:scale-[0.99]"
                )}
              >
                <div className="flex items-start gap-2">
                  {/* Avatar circle */}
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-semibold text-primary">
                    {conv.nome_cliente.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-medium text-foreground truncate">
                        {conv.nome_cliente}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {timeAgo(conv.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <p className="text-xs text-muted-foreground truncate flex-1">
                        {conv.last_message || conv.numero_contrato}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        {tempConfig && (
                          <span className="text-[10px]" title={tempConfig.label}>
                            {tempConfig.emoji}
                          </span>
                        )}
                        {conv.unread_count > 0 && (
                          <Badge variant="destructive" className="text-[9px] h-4 min-w-[16px] px-1 flex items-center justify-center">
                            {conv.unread_count}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
});
