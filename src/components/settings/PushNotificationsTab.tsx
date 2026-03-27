import { useState, useEffect } from "react";
import { Bell, BellRing, BellOff, Settings2, ListTodo, MessageSquare, UserPlus, Ruler, History, CheckCircle, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { usePushPreferences, type PushCategory } from "@/hooks/usePushPreferences";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { supabase } from "@/lib/supabaseClient";
import { format } from "date-fns";
import { toast } from "sonner";

const CATEGORIES: { key: PushCategory; label: string; icon: React.ElementType; desc: string }[] = [
  { key: "tarefas", label: "Tarefas", icon: ListTodo, desc: "Novas tarefas atribuídas e lembretes de prazo" },
  { key: "mensagens", label: "Mensagens", icon: MessageSquare, desc: "Mensagens de clientes no VendaZap" },
  { key: "leads", label: "Leads", icon: UserPlus, desc: "Novos leads enviados para seu atendimento" },
  { key: "medidas", label: "Medidas", icon: Ruler, desc: "Novas solicitações de medida para distribuição" },
];

interface PushLog {
  id: string;
  created_at: string;
  title: string;
  body: string;
  tag: string;
  status: "sent" | "failed" | "expired";
}

export function PushNotificationsTab() {
  const { currentUser } = useCurrentUser();
  const tenantId = (currentUser as any)?.tenant_id || null;
  const { supported, permission, isSubscribed, loading, subscribe, unsubscribe } =
    usePushNotifications(tenantId, currentUser?.id);
  const { preferences, updatePreference } = usePushPreferences();
  const [logs, setLogs] = useState<PushLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    if (!currentUser?.id) return;
    loadLogs();
  }, [currentUser?.id]);

  const loadLogs = async () => {
    if (!currentUser?.id) return;
    setLogsLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_push_logs" as any, { p_user_id: currentUser.id });
      if (!error && data) {
        setLogs((data as unknown as PushLog[]) || []);
      }
    } catch {
      // Table or function may not exist yet
      setLogs([]);
    }
    setLogsLoading(false);
  };

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
      toast.info("Notificações push desativadas");
    } else {
      const success = await subscribe();
      if (success) {
        toast.success("Notificações push ativadas! 🔔");
      } else if (permission === "denied") {
        toast.error("Permissão bloqueada no navegador. Verifique as configurações do site.");
      }
    }
  };

  const StatusIcon = isSubscribed ? BellRing : permission === "denied" ? BellOff : Bell;
  const statusLabel = isSubscribed ? "Ativo" : permission === "denied" ? "Bloqueado" : "Desativado";
  const statusColor = isSubscribed ? "text-emerald-600" : permission === "denied" ? "text-destructive" : "text-muted-foreground";

  const tagLabel = (tag: string) => {
    switch (tag) {
      case "tarefas": return "Tarefa";
      case "mensagens": return "Mensagem";
      case "leads": return "Lead";
      case "medidas": case "medida_nova": return "Medida";
      default: return tag;
    }
  };

  const tagColor = (tag: string) => {
    switch (tag) {
      case "tarefas": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "mensagens": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
      case "leads": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      case "medidas": case "medida_nova": return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      {/* Status & Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <StatusIcon className={`h-5 w-5 ${statusColor}`} />
            Notificações Push
          </CardTitle>
          <CardDescription>
            Receba alertas mesmo com o navegador minimizado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!supported ? (
            <p className="text-sm text-muted-foreground">Seu navegador não suporta notificações push.</p>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Status: <span className={statusColor}>{statusLabel}</span></p>
                {permission === "denied" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Desbloqueie nas configurações do navegador para ativar
                  </p>
                )}
              </div>
              <Button
                variant={isSubscribed ? "destructive" : "default"}
                size="sm"
                onClick={handleToggle}
                disabled={loading || permission === "denied"}
              >
                {isSubscribed ? "Desativar" : "Ativar Push"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category preferences */}
      {isSubscribed && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-5 w-5" />
              Preferências por Categoria
            </CardTitle>
            <CardDescription>Escolha quais tipos de notificação deseja receber</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {CATEGORIES.map(({ key, label, icon: CatIcon, desc }) => (
              <div key={key} className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <CatIcon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <Label htmlFor={`pref-${key}`} className="text-sm font-medium cursor-pointer">{label}</Label>
                    <p className="text-xs text-muted-foreground leading-tight">{desc}</p>
                  </div>
                </div>
                <Switch
                  id={`pref-${key}`}
                  checked={preferences[key]}
                  onCheckedChange={(checked) => updatePreference(key, checked)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5" />
            Histórico de Notificações
          </CardTitle>
          <CardDescription>Últimas 50 notificações push enviadas para você</CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma notificação push registrada ainda.
            </p>
          ) : (
            <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
              {logs.map((log) => {
                const dateStr = (() => { try { return format(new Date(log.created_at), "dd/MM/yy HH:mm"); } catch { return "—"; } })();
                const StatusBadge = log.status === "sent" ? CheckCircle : log.status === "expired" ? Clock : XCircle;
                const statusClass = log.status === "sent" ? "text-emerald-600" : log.status === "expired" ? "text-amber-500" : "text-destructive";
                return (
                  <div key={log.id} className="flex items-start gap-3 py-2.5">
                    <StatusBadge className={`h-4 w-4 mt-0.5 shrink-0 ${statusClass}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{log.title}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${tagColor(log.tag)}`}>
                          {tagLabel(log.tag)}
                        </span>
                      </div>
                      {log.body && <p className="text-xs text-muted-foreground mt-0.5 truncate">{log.body}</p>}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{dateStr}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
