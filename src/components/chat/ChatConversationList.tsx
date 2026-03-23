import { memo, useState, useMemo, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Search, MessageCircle, Filter, CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEMPERATURE_CONFIG, type LeadTemperature } from "@/lib/leadTemperature";
import { format } from "date-fns";
import type { ChatConversation } from "./types";

interface Props {
  conversations: ChatConversation[];
  selectedId: string | null;
  onSelect: (conv: ChatConversation) => void;
  loading: boolean;
}

type TempFilter = LeadTemperature | "all";

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

const BATCH_SIZE = 30;

/** Progressively renders conversations in batches to avoid DOM overload */
const VirtualizedConversationList = memo(function VirtualizedConversationList({
  conversations, selectedId, onSelect,
}: { conversations: ChatConversation[]; selectedId: string | null; onSelect: (c: ChatConversation) => void }) {
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset visible count when list changes
  useMemo(() => { setVisibleCount(BATCH_SIZE); }, [conversations.length]);

  // Intersection Observer to load more items
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelCallback = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) observerRef.current.disconnect();
    if (!node) return;
    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, conversations.length));
      }
    }, { threshold: 0.1 });
    observerRef.current.observe(node);
  }, [conversations.length]);

  const visible = conversations.slice(0, visibleCount);

  return (
    <>
      {visible.map((conv) => (
        <ConversationItem key={conv.id} conv={conv} isSelected={selectedId === conv.id} onSelect={onSelect} />
      ))}
      {visibleCount < conversations.length && (
        <div ref={sentinelCallback} className="p-2 text-center text-[10px] text-muted-foreground">
          Carregando mais ({visibleCount}/{conversations.length})...
        </div>
      )}
    </>
  );
});

const ConversationItem = memo(function ConversationItem({
  conv, isSelected, onSelect,
}: { conv: ChatConversation; isSelected: boolean; onSelect: (c: ChatConversation) => void }) {
  const tempConfig = conv.lead_temperature ? TEMPERATURE_CONFIG[conv.lead_temperature] : null;
  return (
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
        </div>
      </div>
    </button>
  );
});

export const ChatConversationList = memo(function ChatConversationList({ conversations, selectedId, onSelect, loading }: Props) {
  const [search, setSearch] = useState("");
  const [tempFilter, setTempFilter] = useState<TempFilter>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(false);

  const hasActiveFilter = tempFilter !== "all" || unreadOnly || !!dateFilter;

  const filtered = useMemo(() => {
    let result = conversations;

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) => c.nome_cliente.toLowerCase().includes(q) || c.numero_contrato.toLowerCase().includes(q)
      );
    }

    // Temperature
    if (tempFilter !== "all") {
      result = result.filter((c) => c.lead_temperature === tempFilter);
    }

    // Unread only
    if (unreadOnly) {
      result = result.filter((c) => c.unread_count > 0);
    }

    // Date
    if (dateFilter) {
      const dayStr = format(dateFilter, "yyyy-MM-dd");
      result = result.filter((c) => c.last_message_at?.startsWith(dayStr));
    }

    return result;
  }, [conversations, search, tempFilter, unreadOnly, dateFilter]);

  const clearFilters = () => {
    setTempFilter("all");
    setUnreadOnly(false);
    setDateFilter(undefined);
  };

  return (
    <div className="flex flex-col h-full border-r border-border bg-card">
      {/* Header */}
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            Conversas
          </h3>
          <Button
            variant={hasActiveFilter ? "default" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
            className="pl-8 h-8 text-sm"
          />
        </div>

        {/* Filter bar */}
        {showFilters && (
          <div className="space-y-2 pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
            {/* Temperature pills */}
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

            {/* Unread + Date row */}
            <div className="flex items-center gap-1.5">
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

              {hasActiveFilter && (
                <button
                  onClick={clearFilters}
                  className="text-[10px] px-1.5 py-0.5 rounded-full text-muted-foreground hover:text-foreground transition-colors"
                  title="Limpar filtros"
                >
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

      {/* List — progressive rendering for large lists */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {search || hasActiveFilter ? "Nenhum resultado" : "Nenhuma conversa"}
          </div>
        ) : (
          <VirtualizedConversationList
            conversations={filtered}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        )}
      </div>
    </div>
  );
});
