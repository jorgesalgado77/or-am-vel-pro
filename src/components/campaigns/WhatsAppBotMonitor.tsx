import {useState, useEffect} from "react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {Bot, RefreshCw, Phone, CheckCircle2, MessageSquare} from "lucide-react";
import {supabase} from "@/lib/supabaseClient";
import {getTenantId} from "@/lib/tenantState";
import {format} from "date-fns";
import {ptBR} from "date-fns/locale";

interface BotSession {
  id: string;
  phone: string;
  state: { step: string; nome?: string; ambiente?: string; orcamento?: string };
  active: boolean;
  created_at: string;
  updated_at: string;
}

const STEP_LABELS: Record<string, { label: string; color: string }> = {
  greeting: { label: "Saudação", color: "bg-blue-500/10 text-blue-700" },
  name: { label: "Aguardando Nome", color: "bg-amber-500/10 text-amber-700" },
  room: { label: "Aguardando Ambiente", color: "bg-purple-500/10 text-purple-700" },
  budget: { label: "Aguardando Orçamento", color: "bg-orange-500/10 text-orange-700" },
  done: { label: "Concluído", color: "bg-green-500/10 text-green-700" },
};

export function WhatsAppBotMonitor() {
  const [sessions, setSessions] = useState<BotSession[]>([]);
  const [loading, setLoading] = useState(true);
  const tenantId = getTenantId();

  const fetchSessions = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data } = await supabase
      .from("whatsapp_bot_sessions" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (data) setSessions(data as unknown as BotSession[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchSessions();

    // Realtime subscription
    const channel = supabase
      .channel("bot-sessions-monitor")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "whatsapp_bot_sessions",
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        fetchSessions();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantId]);

  const activeSessions = sessions.filter(s => s.active);
  const completedSessions = sessions.filter(s => !s.active);

  const formatPhone = (phone: string) => {
    if (phone.length === 13) return `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`;
    return phone;
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center"><Bot className="h-4 w-4 text-green-600" /></div>
            <div>
              <p className="text-lg font-bold">{activeSessions.length}</p>
              <p className="text-[10px] text-muted-foreground">Ativas Agora</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center"><CheckCircle2 className="h-4 w-4 text-blue-600" /></div>
            <div>
              <p className="text-lg font-bold">{completedSessions.length}</p>
              <p className="text-[10px] text-muted-foreground">Concluídas</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center"><Phone className="h-4 w-4 text-purple-600" /></div>
            <div>
              <p className="text-lg font-bold">{sessions.length}</p>
              <p className="text-[10px] text-muted-foreground">Total Sessões</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center"><MessageSquare className="h-4 w-4 text-amber-600" /></div>
            <div>
              <p className="text-lg font-bold">{sessions.filter(s => s.state?.step === "done").length}</p>
              <p className="text-[10px] text-muted-foreground">Leads Gerados</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Sessions table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" /> Sessões do Bot
            </CardTitle>
            <Button variant="outline" size="sm" onClick={fetchSessions} disabled={loading} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Telefone</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Ambiente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Última Atividade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhuma sessão do bot ainda. As sessões aparecerão aqui quando clientes interagirem via WhatsApp.
                  </TableCell>
                </TableRow>
              ) : sessions.map(s => {
                const stepInfo = STEP_LABELS[s.state?.step || "greeting"] || STEP_LABELS.greeting;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{formatPhone(s.phone)}</TableCell>
                    <TableCell><Badge variant="outline" className={stepInfo.color}>{stepInfo.label}</Badge></TableCell>
                    <TableCell className="text-sm">{s.state?.nome || "—"}</TableCell>
                    <TableCell className="text-sm">{s.state?.ambiente || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={s.active ? "default" : "secondary"} className={s.active ? "bg-green-600" : ""}>
                        {s.active ? "Ativa" : "Finalizada"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.updated_at ? format(new Date(s.updated_at), "dd/MM HH:mm", { locale: ptBR }) : "—"}
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
