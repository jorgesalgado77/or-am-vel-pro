/**
 * Meeting Transcripts History — shows saved Deal Room meeting transcriptions
 * with date filters and text search.
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, Search, FileText, Clock, User, Mic, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TranscriptRecord {
  id: string;
  session_id: string;
  client_name: string | null;
  client_id: string | null;
  usuario_id: string | null;
  transcript: any[];
  total_entries: number;
  avg_closing_score: number;
  total_objections: number;
  duration_seconds: number;
  created_at: string;
  ai_coach_messages: any[] | null;
}

interface Props {
  clientId?: string;
}

export function MeetingTranscriptsHistory({ clientId }: Props) {
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadTranscripts();
  }, [clientId, dateFrom, dateTo]);

  const loadTranscripts = async () => {
    setLoading(true);
    const tenantId = getTenantId();
    let query = supabase
      .from("dealroom_meeting_transcripts" as any)
      .select("*")
      .order("created_at", { ascending: false });

    if (tenantId) query = query.eq("tenant_id", tenantId);
    if (clientId) query = query.eq("client_id", clientId);
    if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59`);

    const { data } = await query;
    setTranscripts((data as any[] as TranscriptRecord[]) || []);
    setLoading(false);
  };

  const filtered = transcripts.filter(t => {
    if (!searchText) return true;
    const lower = searchText.toLowerCase();
    if (t.client_name?.toLowerCase().includes(lower)) return true;
    if (Array.isArray(t.transcript)) {
      return t.transcript.some((e: any) => e.text?.toLowerCase().includes(lower));
    }
    return false;
  });

  const formatDuration = (seconds: number) => {
    if (!seconds) return "—";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}min ${s}s`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Mic className="h-4 w-4 text-primary" />
          Histórico de Transcrições de Reuniões
          <Badge variant="secondary" className="text-[10px] ml-auto">{filtered.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por texto ou cliente..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="pl-8 h-9 text-xs"
            />
          </div>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 text-xs w-36" />
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 text-xs w-36" />
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma transcrição encontrada</div>
        ) : (
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-2">
              {filtered.map(t => (
                <div key={t.id} className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                    className="w-full text-left px-3 py-2.5 hover:bg-secondary/50 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {t.client_name || "Cliente não identificado"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(t.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} • {t.total_entries} falas • {formatDuration(t.duration_seconds)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={t.avg_closing_score >= 60 ? "default" : "secondary"} className="text-[9px]">
                        Score: {t.avg_closing_score}%
                      </Badge>
                      {t.total_objections > 0 && (
                        <Badge variant="destructive" className="text-[9px]">{t.total_objections} objeções</Badge>
                      )}
                      {expandedId === t.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </div>
                  </button>

                  {expandedId === t.id && Array.isArray(t.transcript) && (
                    <div className="border-t px-3 py-2 bg-muted/30 space-y-1.5 max-h-72 overflow-y-auto">
                      {t.transcript.map((entry: any, i: number) => (
                        <div key={i} className={`flex ${entry.speaker === "vendedor" ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-[11px] ${
                            entry.speaker === "vendedor"
                              ? "bg-primary/10 text-primary"
                              : "bg-background text-foreground border"
                          }`}>
                            <span className="font-semibold text-[9px] block mb-0.5">
                              {entry.speaker === "vendedor" ? "🎤 Vendedor" : "👤 Cliente"}
                              {entry.intent && <span className="ml-1 opacity-70">({entry.intent})</span>}
                              {entry.timestamp && (
                                <span className="ml-1 opacity-50">
                                  {new Date(entry.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              )}
                            </span>
                            <p>{entry.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
