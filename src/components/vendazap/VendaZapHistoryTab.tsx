/**
 * VendaZap Conversation History Tab
 * Shows all saved conversation sessions grouped by client.
 * Allows resuming a conversation where it left off.
 */
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  History, MessageSquare, Copy, ExternalLink, Trash2, Search,
  ArrowRight, Target, Clock, Flame, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  getAllSessions,
  deleteSession,
  deleteClientSessions,
  clearAllHistory,
  type ConversationSession,
} from "@/lib/vendazapHistory";
import { COPY_TYPES } from "./VendaZapGenerateTab";

interface Props {
  onResumeSession: (session: ConversationSession) => void;
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const color =
    score >= 70 ? "text-green-700 dark:text-green-400 border-green-500/40 bg-green-50 dark:bg-green-950/30"
    : score >= 40 ? "text-amber-700 dark:text-amber-400 border-amber-500/40 bg-amber-50 dark:bg-amber-950/30"
    : "text-red-700 dark:text-red-400 border-red-500/40 bg-red-50 dark:bg-red-950/30";
  return (
    <Badge variant="outline" className={`text-[10px] ${color}`}>
      {score >= 70 ? "🔥" : score >= 40 ? "🟡" : "❄️"} {score}%
    </Badge>
  );
}

export function VendaZapHistoryTab({ onResumeSession }: Props) {
  const [search, setSearch] = useState("");
  const [sessions, setSessions] = useState(() => getAllSessions());
  const [expandedClient, setExpandedClient] = useState<string | null>(null);

  const refresh = () => setSessions(getAllSessions());

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.toLowerCase();
    return sessions.filter((s) => s.clientName.toLowerCase().includes(q));
  }, [sessions, search]);

  // Group by client
  const grouped = useMemo(() => {
    const map = new Map<string, ConversationSession[]>();
    for (const s of filtered) {
      const existing = map.get(s.clientId) || [];
      existing.push(s);
      map.set(s.clientId, existing);
    }
    return Array.from(map.entries()).map(([clientId, clientSessions]) => ({
      clientId,
      clientName: clientSessions[0].clientName,
      sessions: clientSessions,
      totalMessages: clientSessions.reduce((sum, s) => sum + s.totalMessages, 0),
      lastScore: clientSessions[0].lastScore,
      lastUpdated: clientSessions[0].updatedAt,
    }));
  }, [filtered]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Mensagem copiada!");
  };

  const handleDelete = (sessionId: string) => {
    deleteSession(sessionId);
    refresh();
    toast.success("Sessão removida");
  };

  const handleDeleteClient = (clientId: string) => {
    deleteClientSessions(clientId);
    refresh();
    toast.success("Histórico do cliente removido");
  };

  const handleClearAll = () => {
    clearAllHistory();
    refresh();
    toast.success("Todo histórico limpo");
  };

  if (sessions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Histórico de Conversas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <History className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm text-center">Nenhuma conversa salva ainda</p>
            <p className="text-xs text-center mt-1">As conversas geradas serão salvas automaticamente aqui</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Histórico de Conversas
            <Badge variant="secondary" className="text-[10px]">{sessions.length} sessões</Badge>
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={refresh}>
              <RefreshCw className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-destructive" onClick={handleClearAll}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome do cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <ScrollArea className="h-[500px]">
          <div className="space-y-2">
            {grouped.map((group) => {
              const isExpanded = expandedClient === group.clientId;
              const latestSession = group.sessions[0];
              const copyType = COPY_TYPES.find((ct) => ct.value === latestSession.settings.tipoCopy);
              const CopyIcon = copyType?.icon || MessageSquare;

              return (
                <div key={group.clientId} className="border rounded-lg overflow-hidden">
                  {/* Client header */}
                  <button
                    onClick={() => setExpandedClient(isExpanded ? null : group.clientId)}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors flex items-center gap-2"
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                      {group.clientName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{group.clientName}</span>
                        <ScoreBadge score={group.lastScore} />
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <MessageSquare className="h-2.5 w-2.5" />
                          {group.totalMessages} msgs
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {format(new Date(group.lastUpdated), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                        {latestSession.settings.discProfile && (
                          <span className="flex items-center gap-0.5">
                            <Target className="h-2.5 w-2.5" />
                            DISC: {latestSession.settings.discProfile}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="default"
                        size="sm"
                        className="h-7 text-[10px] gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          onResumeSession(latestSession);
                        }}
                      >
                        <ArrowRight className="h-3 w-3" />
                        Continuar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClient(group.clientId);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </button>

                  {/* Expanded: show conversation entries */}
                  {isExpanded && (
                    <div className="border-t border-border px-3 py-2 bg-muted/20 space-y-2">
                      {/* Settings used */}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        <Badge variant="outline" className="text-[10px]">
                          <CopyIcon className="h-2.5 w-2.5 mr-1" />
                          {copyType?.label || latestSession.settings.tipoCopy}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          Tom: {latestSession.settings.tom}
                        </Badge>
                        {latestSession.dealRoomLinks.length > 0 && (
                          <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                            🔗 {latestSession.dealRoomLinks.length} link(s) Deal Room
                          </Badge>
                        )}
                      </div>

                      {/* Messages */}
                      <div className="max-h-64 overflow-y-auto scrollbar-none space-y-1.5" style={{ scrollbarWidth: "none" }}>
                        {latestSession.entries.map((entry, i) => (
                          <div key={i} className={`flex ${entry.remetente_tipo === "ia" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-[11px] ${
                              entry.remetente_tipo === "ia"
                                ? "bg-primary/10 text-primary"
                                : "bg-card text-foreground border border-border"
                            }`}>
                              <div className="flex items-center gap-1 mb-0.5">
                                <span className="font-semibold text-[10px]">
                                  {entry.remetente_tipo === "ia" ? "🤖 IA" : "👤 Cliente"}
                                </span>
                                {entry.intent && <span className="opacity-60 text-[9px]">({entry.intent})</span>}
                                {entry.score !== undefined && <ScoreBadge score={entry.score} />}
                                {entry.timestamp && (
                                  <span className="ml-auto text-[9px] opacity-50">
                                    {format(new Date(entry.timestamp), "HH:mm")}
                                  </span>
                                )}
                              </div>
                              <p>{entry.mensagem}</p>
                              {entry.remetente_tipo === "ia" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 text-[9px] gap-0.5 px-1 mt-1 -ml-1"
                                  onClick={() => handleCopy(entry.mensagem)}
                                >
                                  <Copy className="h-2.5 w-2.5" />Copiar
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Deal Room links */}
                      {latestSession.dealRoomLinks.length > 0 && (
                        <div className="space-y-1 pt-1 border-t border-border/50">
                          <p className="text-[10px] font-medium text-muted-foreground">Links Deal Room:</p>
                          {latestSession.dealRoomLinks.map((link, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <a href={link} target="_blank" rel="noopener" className="text-[10px] text-primary underline truncate">{link}</a>
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => handleCopy(link)}>
                                <Copy className="h-2.5 w-2.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
