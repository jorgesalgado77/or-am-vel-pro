import { memo, useState, useMemo, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, MessageCircle, Filter, CalendarDays, X, MessageSquarePlus, ChevronDown, ChevronRight, Users, Phone, Trash2, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEMPERATURE_CONFIG, type LeadTemperature } from "@/lib/leadTemperature";
import { isNotificationSoundEnabled, setNotificationSoundEnabled } from "@/lib/notificationSound";
import { format } from "date-fns";
import type { ChatConversation } from "./types";

interface Props {
  conversations: ChatConversation[];
  selectedId: string | null;
  onSelect: (conv: ChatConversation) => void;
  onDelete?: (conv: ChatConversation) => void;
  loading: boolean;
  onStartConversation?: () => void;
  currentUserName?: string | null;
  isAdminOrManager?: boolean;
}

type TempFilter = LeadTemperature | "all";
type VendedorFilter = string | "all";

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

const ConversationItem = memo(function ConversationItem({
  conv, isSelected, onSelect, onDelete, isAdmin,
}: { conv: ChatConversation; isSelected: boolean; onSelect: (c: ChatConversation) => void; onDelete?: (c: ChatConversation) => void; isAdmin?: boolean }) {
  const tempConfig = conv.lead_temperature ? TEMPERATURE_CONFIG[conv.lead_temperature] : null;
  const displayPhone = conv.phone || (conv.numero_contrato?.startsWith("WA-") ? conv.numero_contrato.replace("WA-", "") : null);
  return (
    <div className="relative group">
      <button
        onClick={() => onSelect(conv)}
        className={cn(
          "w-full text-left px-3 py-2.5 border-b border-border/50 transition-colors duration-100",
          isSelected ? "bg-primary/8" : "hover:bg-muted/50 active:scale-[0.99]"
        )}
      >
        <div className="flex items-start gap-2">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-semibold text-primary">
            {conv.nome_cliente.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="text-sm font-medium text-foreground truncate">{conv.nome_cliente}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(conv.last_message_at)}</span>
            </div>
            <div className="flex items-center justify-between gap-1 mt-0.5">
              <p className="text-xs text-muted-foreground truncate flex-1">{conv.last_message || conv.numero_contrato}</p>
              <div className="flex items-center gap-1 shrink-0">
                {tempConfig && <span className="text-[10px]" title={tempConfig.label}>{tempConfig.emoji}</span>}
                {conv.unread_count > 0 && (
                  <Badge variant="destructive" className="text-[9px] h-4 min-w-[16px] px-1 flex items-center justify-center">
                    {conv.unread_count}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {displayPhone && (
                <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                  <Phone className="h-2.5 w-2.5" />
                  {displayPhone}
                </span>
              )}
              {!displayPhone && conv.numero_contrato && !conv.numero_contrato.startsWith("WA-") && (
                <span className="text-[10px] text-muted-foreground">📋 {conv.numero_contrato}</span>
              )}
              {conv.vendedor_nome && (
                <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-normal">
                  👤 {conv.vendedor_nome}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </button>
      {isAdmin && onDelete && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(conv); }}
              className="absolute right-2 top-2 h-6 w-6 rounded-md bg-destructive/10 text-destructive flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/20"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left"><p className="text-xs">Excluir conversa</p></TooltipContent>
        </Tooltip>
      )}
    </div>
  );
});

export const ChatConversationList = memo(function ChatConversationList({ conversations, selectedId, onSelect, onDelete, loading, onStartConversation, currentUserName, isAdminOrManager }: Props) {
  const [search, setSearch] = useState("");
  const [tempFilter, setTempFilter] = useState<TempFilter>("all");
  const [vendedorFilter, setVendedorFilter] = useState<VendedorFilter>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(false);
  const [isListOpen, setIsListOpen] = useState(!selectedId);
  const [isWaListOpen, setIsWaListOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(isNotificationSoundEnabled());

  const vendedorCounts = useMemo(() => {
    const map = new Map<string, number>();
    conversations.forEach(c => {
      if (c.vendedor_nome) map.set(c.vendedor_nome, (map.get(c.vendedor_nome) || 0) + 1);
    });
    return map;
  }, [conversations]);

  const vendedores = useMemo(() => Array.from(vendedorCounts.keys()).sort(), [vendedorCounts]);

  const hasActiveFilter = tempFilter !== "all" || unreadOnly || !!dateFilter || vendedorFilter !== "all";
  const totalUnread = useMemo(() => conversations.reduce((sum, c) => sum + c.unread_count, 0), [conversations]);

  const filtered = useMemo(() => {
    let result = conversations;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) => c.nome_cliente.toLowerCase().includes(q) || c.numero_contrato.toLowerCase().includes(q)
      );
    }
    if (tempFilter !== "all") {
      result = result.filter((c) => c.lead_temperature === tempFilter);
    }
    if (vendedorFilter !== "all") {
      result = result.filter((c) => c.vendedor_nome === vendedorFilter);
    }
    if (unreadOnly) {
      result = result.filter((c) => c.unread_count > 0);
    }
    if (dateFilter) {
      const dayStr = format(dateFilter, "yyyy-MM-dd");
      result = result.filter((c) => c.last_message_at?.startsWith(dayStr));
    }
    return result;
  }, [conversations, search, tempFilter, vendedorFilter, unreadOnly, dateFilter]);

  // Split into system clients vs WhatsApp imported contacts
  const systemClients = useMemo(() => filtered.filter(c => !c.numero_contrato?.startsWith("WA-")), [filtered]);
  const waContacts = useMemo(() => filtered.filter(c => c.numero_contrato?.startsWith("WA-")), [filtered]);

  const clearFilters = () => {
    setTempFilter("all");
    setVendedorFilter("all");
    setUnreadOnly(false);
    setDateFilter(undefined);
  };

  // Find selected conversation name
  const selectedConv = conversations.find(c => c.id === selectedId);

  return (
    <div className="flex flex-col h-full border-r border-border bg-card">
      {/* Role-based filter indicator */}
      {currentUserName && (
        <div className={cn(
          "px-3 py-1.5 border-b border-border text-[10px] font-medium flex items-center gap-1.5",
          isAdminOrManager
            ? "bg-primary/5 text-primary"
            : "bg-accent/50 text-accent-foreground"
        )}>
          {isAdminOrManager ? (
            <>
              <Users className="h-3 w-3" />
              <span>👁️ Visão completa — Todas as conversas</span>
            </>
          ) : (
            <>
              <Users className="h-3 w-3" />
              <span>🔒 Minhas conversas — {currentUserName}</span>
            </>
          )}
        </div>
      )}
      {/* Header */}
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            Conversas
          </h3>
          <div className="flex items-center gap-1">
            {onStartConversation && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onStartConversation}>
                    <MessageSquarePlus className="h-3.5 w-3.5 text-primary" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">Iniciar nova conversa</p>
                </TooltipContent>
              </Tooltip>
            )}
            <Button
              variant={hasActiveFilter ? "default" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        {showFilters && (
          <div className="space-y-2 pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex flex-wrap gap-1">
              {(["all", "quente", "morno", "frio"] as const).map((t) => {
                const isActive = tempFilter === t;
                const cfg = t === "all" ? null : TEMPERATURE_CONFIG[t];
                return (
                  <button
                    key={t}
                    onClick={() => setTempFilter(t)}
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors border",
                      isActive
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
                    )}
                  >
                    {t === "all" ? "Todos" : `${cfg?.emoji} ${cfg?.label}`}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setUnreadOnly(!unreadOnly)}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors border",
                  unreadOnly
                    ? "bg-destructive text-destructive-foreground border-destructive"
                    : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
                )}
              >
                📩 Não lidas
              </button>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors border flex items-center gap-1",
                      dateFilter
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
                    )}
                  >
                    <CalendarDays className="h-3 w-3" />
                    {dateFilter ? format(dateFilter, "dd/MM") : "Data"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFilter}
                    onSelect={setDateFilter}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              {vendedores.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors border flex items-center gap-1",
                        vendedorFilter !== "all"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
                      )}
                    >
                      👤 {vendedorFilter !== "all" ? vendedorFilter : "Vendedor"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1" align="start">
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => setVendedorFilter("all")}
                        className={cn(
                          "text-xs px-2 py-1.5 rounded text-left transition-colors flex items-center justify-between",
                          vendedorFilter === "all" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                        )}
                      >
                        <span>Todos os vendedores</span>
                        <Badge variant="secondary" className="text-[9px] h-4 px-1.5 ml-2">{conversations.length}</Badge>
                      </button>
                      {vendedores.map(v => (
                        <button
                          key={v}
                          onClick={() => setVendedorFilter(v)}
                          className={cn(
                            "text-xs px-2 py-1.5 rounded text-left transition-colors truncate flex items-center justify-between",
                            vendedorFilter === v ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                          )}
                        >
                          <span className="truncate">👤 {v}</span>
                          <Badge variant="secondary" className="text-[9px] h-4 px-1.5 ml-2 shrink-0">{vendedorCounts.get(v) || 0}</Badge>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              {hasActiveFilter && (
                <button onClick={clearFilters} className="text-[10px] px-1.5 py-0.5 rounded-full text-muted-foreground hover:text-foreground transition-colors" title="Limpar filtros">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Active filter summary */}
      {hasActiveFilter && !showFilters && (
        <div className="px-3 py-1.5 bg-primary/5 border-b border-border flex items-center justify-between">
          <span className="text-[10px] text-primary font-medium">
            {filtered.length} conversa{filtered.length !== 1 ? "s" : ""} filtrada{filtered.length !== 1 ? "s" : ""}
          </span>
          <button onClick={clearFilters} className="text-[10px] text-muted-foreground hover:text-foreground">
            Limpar
          </button>
        </div>
      )}

      {/* Collapsible Client List */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {/* System Clients */}
        <Collapsible open={isListOpen} onOpenChange={setIsListOpen}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Clientes da Loja</span>
                {totalUnread > 0 && (
                  <Badge variant="destructive" className="text-[9px] h-4 min-w-[16px] px-1">
                    {totalUnread}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">{systemClients.length}</span>
                {isListOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-3 py-2 border-b border-border/50">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente..." className="pl-8 h-8 text-sm" />
              </div>
            </div>
            <div className="max-h-[35vh] overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Carregando...</div>
              ) : systemClients.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {search || hasActiveFilter ? "Nenhum resultado" : "Nenhuma conversa"}
                </div>
              ) : (
                systemClients.map((conv) => (
                  <ConversationItem key={conv.id} conv={conv} isSelected={selectedId === conv.id} onSelect={(c) => { onSelect(c); setIsListOpen(false); }} />
                ))
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* WhatsApp Imported Contacts */}
        {waContacts.length > 0 && (
          <Collapsible open={isWaListOpen} onOpenChange={setIsWaListOpen}>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-3 py-2 bg-emerald-500/5 border-b border-border hover:bg-emerald-500/10 transition-colors">
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-xs font-semibold text-foreground">Contatos WhatsApp</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">{waContacts.length}</span>
                  {isWaListOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="max-h-[35vh] overflow-y-auto">
                {waContacts.map((conv) => (
                  <ConversationItem key={conv.id} conv={conv} isSelected={selectedId === conv.id} onSelect={(c) => { onSelect(c); setIsWaListOpen(false); }} />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
});