/**
 * TechnicalDashboardCards — Cards for technical roles (técnico, liberador, conferente)
 * Shows: queue position, total scheduled, release ceiling, salary preview
 * Each card has an eye toggle to mask/unmask sensitive values with ****
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ListOrdered, Target, Wallet, Info, CalendarDays, Eye, EyeOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { formatCurrency } from "@/lib/financing";
import { useMetasTetos } from "@/hooks/useMetasTetos";

interface TechnicalDashboardCardsProps {
  userId?: string;
  userName?: string;
}

interface QueueItem {
  clientName: string;
  position: number;
  assignedTo: string | null;
}

const MASK = "****";
const MASK_STORAGE_PREFIX = "tech-card-mask";

function useMasked(cardKey: string, userId?: string) {
  const storageKey = userId ? `${MASK_STORAGE_PREFIX}:${userId}:${cardKey}` : null;
  const [masked, setMasked] = useState(() => {
    if (!storageKey) return false;
    return localStorage.getItem(storageKey) === "1";
  });
  const toggle = useCallback(() => {
    setMasked((prev) => {
      const next = !prev;
      if (storageKey) localStorage.setItem(storageKey, next ? "1" : "0");
      return next;
    });
  }, [storageKey]);
  return { masked, toggle };
}

function MaskToggle({ masked, onToggle }: { masked: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className="p-0.5 rounded hover:bg-muted/60 transition-colors"
      title={masked ? "Mostrar dados" : "Ocultar dados"}
    >
      {masked ? (
        <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
      ) : (
        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

export function TechnicalDashboardCards({ userId, userName }: TechnicalDashboardCardsProps) {
  const { tetoLiberacao } = useMetasTetos();
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [liberatedValue, setLiberatedValue] = useState(0);
  const [liberatedCount, setLiberatedCount] = useState(0);
  const [salarioFixo, setSalarioFixo] = useState(0);
  const [comissaoPercentual, setComissaoPercentual] = useState(0);
  const [tipoRegime, setTipoRegime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const maskFila = useMasked("fila", userId);
  const maskTot = useMasked("tot", userId);
  const maskTeto = useMasked("teto", userId);
  const maskSalario = useMasked("salario", userId);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const tenantId = await getResolvedTenantId();
    if (!tenantId) {
      setLoading(false);
      return;
    }

    // Fetch full user profile including email and auth_user_id for robust matching
    const { data: userData } = await supabase
      .from("usuarios")
      .select("salario_fixo, comissao_percentual, tipo_regime, nome_completo, apelido, email, auth_user_id")
      .eq("id", userId)
      .single();

    if (userData) {
      setSalarioFixo(Number(userData.salario_fixo) || 0);
      setComissaoPercentual(Number(userData.comissao_percentual) || 0);
      setTipoRegime(userData.tipo_regime);
    }

    // Build all possible identity strings for matching
    const userNameLower = (userName || userData?.nome_completo || userData?.apelido || "").toLowerCase();
    const userEmail = ((userData as any)?.email || "").toLowerCase();
    const authUserId = ((userData as any)?.auth_user_id || "").toLowerCase();

    const matchesUser = (value: string | null | undefined): boolean => {
      if (!value) return false;
      const v = value.toLowerCase().trim();
      if (!v) return false;
      if (v === userId.toLowerCase()) return true;
      if (authUserId && v === authUserId) return true;
      if (userEmail && v === userEmail) return true;
      if (userNameLower && (v.includes(userNameLower) || userNameLower.includes(v))) return true;
      return false;
    };

    const { data: mrData } = await (supabase as any)
      .from("measurement_requests")
      .select("id, client_id, nome_cliente, assigned_to, status, created_at, updated_at")
      .eq("tenant_id", tenantId)
      .not("status", "eq", "concluido")
      .order("created_at", { ascending: true });

    const queue = (mrData || []) as any[];
    setQueueTotal(queue.length);

    const items: QueueItem[] = queue.map((c: any, idx: number) => ({
      clientName: c.nome_cliente || "Cliente",
      position: idx + 1,
      assignedTo: c.assigned_to,
    }));
    setQueueItems(items);

    const myPosition = items.findIndex((item) => matchesUser(item.assignedTo));
    setQueuePosition(myPosition >= 0 ? myPosition + 1 : null);

    const now = new Date();
    const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthStartDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const nextMonthDate = `${now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()}-${String(now.getMonth() === 11 ? 1 : now.getMonth() + 2).padStart(2, "0")}-01`;

    const [
      { data: trackingData },
      { data: historyData },
      { data: scheduledTasks },
      { data: allMR },
    ] = await Promise.all([
      supabase
        .from("client_tracking")
        .select("client_id, valor_contrato, updated_at")
        .eq("tenant_id", tenantId),
      supabase
        .from("client_status_history" as any)
        .select("client_id, novo_status, created_at, alterado_por")
        .eq("tenant_id", tenantId)
        .gte("created_at", monthStartIso),
      (supabase as any)
        .from("tasks")
        .select("id, data_tarefa, horario")
        .eq("tenant_id", tenantId)
        .eq("responsavel_id", userId)
        .in("tipo", ["medicao_tecnica", "medicao"])
        .gte("data_tarefa", monthStartDate)
        .lt("data_tarefa", nextMonthDate),
      // Fetch ALL measurement requests with valor_venda_avista
      (supabase as any)
        .from("measurement_requests")
        .select("id, client_id, nome_cliente, assigned_to, status, valor_venda_avista, updated_at, created_at")
        .eq("tenant_id", tenantId),
    ]);

    // Build tracking map for fallback values
    const trackingMap = new Map<string, number>();
    (trackingData as any[] || []).forEach((t: any) => {
      trackingMap.set(t.client_id, Number(t.valor_contrato) || 0);
    });

    // PRIMARY: Sum valor_venda_avista from ALL measurement_requests assigned to this user
    let totalValorAvista = 0;
    let assignedMRCount = 0;
    (allMR as any[] || []).forEach((mr: any) => {
      if (matchesUser(mr.assigned_to)) {
        totalValorAvista += Number(mr.valor_venda_avista) || 0;
        assignedMRCount++;
      }
    });

    // SECONDARY: Also add client_status_history transitions (em_compras/enviado_compras) 
    // for clients NOT already counted via measurement_requests
    const mrClientIds = new Set<string>();
    (allMR as any[] || []).forEach((mr: any) => {
      if (matchesUser(mr.assigned_to)) mrClientIds.add(mr.client_id);
    });

    const historyClientIds = new Set<string>();
    (historyData as any[] || []).forEach((h: any) => {
      if (
        (h.novo_status === "em_compras" || h.novo_status === "enviado_compras") &&
        matchesUser(h.alterado_por) &&
        !mrClientIds.has(h.client_id)
      ) {
        historyClientIds.add(h.client_id);
      }
    });

    // Add tracking values for history-only clients
    historyClientIds.forEach((cid) => {
      totalValorAvista += trackingMap.get(cid) || 0;
    });

    const totalLiberatedCount = assignedMRCount + historyClientIds.size;

    setScheduledCount(((scheduledTasks as any[]) || []).filter((task) => Boolean(task?.data_tarefa && task?.horario)).length);
    setLiberatedValue(totalValorAvista);
    setLiberatedCount(totalLiberatedCount);
    setLoading(false);
  }, [userId, userName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel("tech-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "measurement_requests" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => fetchData())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "client_status_history" }, () => fetchData())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const tetoValue = tetoLiberacao?.valor || 0;
  const tetoPercent = tetoValue > 0 ? Math.min(100, (liberatedValue / tetoValue) * 100) : 0;
  const faltaParaTeto = Math.max(0, tetoValue - liberatedValue);
  const comissaoSobreLiberacao = liberatedValue * (comissaoPercentual / 100);
  const salarioPrevisto = salarioFixo + comissaoSobreLiberacao;

  const m = (val: string | number, isMasked: boolean) => isMasked ? MASK : val;
  const mCurrency = (val: number, isMasked: boolean) => isMasked ? MASK : formatCurrency(val);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Card 1: Fila de Liberação */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 transition-all duration-200 hover:scale-[1.02] hover:shadow-md cursor-default">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-primary/15">
                    <ListOrdered className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-foreground">Fila de Liberação</h3>
                    <p className="text-[10px] text-muted-foreground">Sua posição na fila</p>
                  </div>
                  <MaskToggle masked={maskFila.masked} onToggle={maskFila.toggle} />
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-center flex-1">
                    <p className="text-3xl font-bold text-primary">
                      {maskFila.masked ? MASK : (queuePosition !== null ? `${queuePosition}º` : "—")}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Posição</p>
                  </div>
                  <div className="w-px h-12 bg-border" />
                  <div className="text-center flex-1">
                    <p className="text-3xl font-bold text-foreground">{m(queueTotal, maskFila.masked)}</p>
                    <p className="text-[10px] text-muted-foreground">Total na Fila</p>
                  </div>
                </div>

                {!maskFila.masked && queuePosition !== null && queuePosition <= 3 && (
                  <Badge variant="default" className="w-full justify-center text-xs">
                    🔔 Você é o próximo!
                  </Badge>
                )}
                {!maskFila.masked && queuePosition === null && queueTotal > 0 && (
                  <Badge variant="secondary" className="w-full justify-center text-xs">
                    Nenhum item atribuído a você
                  </Badge>
                )}
                {!maskFila.masked && queueTotal === 0 && (
                  <Badge variant="outline" className="w-full justify-center text-xs">
                    Fila vazia no momento
                  </Badge>
                )}
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[250px] text-xs">
            Mostra sua posição atual na fila de liberação de projetos.
          </TooltipContent>
        </Tooltip>

        {/* Card 2: Total Agendado (TOT) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="border-secondary/40 bg-gradient-to-br from-secondary/35 to-accent/10 transition-all duration-200 hover:scale-[1.02] hover:shadow-md cursor-default">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-secondary">
                    <CalendarDays className="h-5 w-5 text-secondary-foreground" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-foreground">Total Agendado</h3>
                    <p className="text-[10px] text-muted-foreground">Mês atual • medições com hora</p>
                  </div>
                  <MaskToggle masked={maskTot.masked} onToggle={maskTot.toggle} />
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </div>

                <div className="text-center py-2">
                  <p className="text-3xl font-bold text-foreground">{m(scheduledCount, maskTot.masked)}</p>
                  <p className="text-[10px] text-muted-foreground">Agendamentos</p>
                </div>

                <Badge variant="secondary" className="w-full justify-center text-xs">
                  TOT do mês atual
                </Badge>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[250px] text-xs">
            Quantidade total de tarefas de medição já agendadas com data e hora para você neste mês.
          </TooltipContent>
        </Tooltip>

        {/* Card 3: Teto de Liberação */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="border-accent/30 bg-gradient-to-br from-accent/5 to-accent/10 transition-all duration-200 hover:scale-[1.02] hover:shadow-md cursor-default">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-accent/15">
                    <Target className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-foreground">Teto de Liberação</h3>
                    <p className="text-[10px] text-muted-foreground">Mês atual • {maskTeto.masked ? MASK : liberatedCount} liberações</p>
                  </div>
                  <MaskToggle masked={maskTeto.masked} onToggle={maskTeto.toggle} />
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-sm font-bold text-primary">{mCurrency(liberatedValue, maskTeto.masked)}</p>
                    <p className="text-[10px] text-muted-foreground">Liberado</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{mCurrency(tetoValue, maskTeto.masked)}</p>
                    <p className="text-[10px] text-muted-foreground">Teto</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-destructive">{mCurrency(faltaParaTeto, maskTeto.masked)}</p>
                    <p className="text-[10px] text-muted-foreground">Faltante</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Progresso</span>
                    <span>{maskTeto.masked ? MASK : `${tetoPercent.toFixed(1)}%`}</span>
                  </div>
                  <Progress value={maskTeto.masked ? 0 : tetoPercent} className="h-2.5" />
                </div>

                {!maskTeto.masked && tetoPercent >= 100 && (
                  <Badge variant="default" className="w-full justify-center text-xs bg-green-600">
                    ✅ Teto atingido!
                  </Badge>
                )}
                {!maskTeto.masked && tetoValue === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center italic">
                    Nenhum teto configurado para este mês
                  </p>
                )}
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[250px] text-xs">
            Acompanhe seu progresso em relação ao teto de liberação mensal.
          </TooltipContent>
        </Tooltip>

        {/* Card 4: Prévia do Salário */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="border-green-500/30 bg-gradient-to-br from-green-500/5 to-green-500/10 transition-all duration-200 hover:scale-[1.02] hover:shadow-md cursor-default">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-green-500/15">
                    <Wallet className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-foreground">Prévia do Salário</h3>
                    <p className="text-[10px] text-muted-foreground">
                      {tipoRegime ? `Regime: ${tipoRegime.toUpperCase()}` : "Mês atual"}
                    </p>
                  </div>
                  <MaskToggle masked={maskSalario.masked} onToggle={maskSalario.toggle} />
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Salário Fixo</span>
                    <span className="text-sm font-semibold text-foreground">{mCurrency(salarioFixo, maskSalario.masked)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Comissão ({maskSalario.masked ? MASK : `${comissaoPercentual}%`})</span>
                    <span className="text-sm font-semibold text-primary">{mCurrency(comissaoSobreLiberacao, maskSalario.masked)}</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-foreground">Total Previsto</span>
                    <span className="text-lg font-bold text-green-600">{mCurrency(salarioPrevisto, maskSalario.masked)}</span>
                  </div>
                </div>

                <p className="text-[9px] text-muted-foreground text-center italic">
                  * Valores sujeitos a descontos legais (INSS, IRRF, etc.)
                </p>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[250px] text-xs">
            Prévia estimada do salário do mês atual.
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
