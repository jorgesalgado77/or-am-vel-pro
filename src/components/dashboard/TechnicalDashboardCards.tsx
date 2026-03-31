/**
 * TechnicalDashboardCards — Cards for technical roles (técnico, liberador, conferente)
 * Shows: queue position, release ceiling progress, salary preview
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ListOrdered, Target, Wallet } from "lucide-react";
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

export function TechnicalDashboardCards({ userId, userName }: TechnicalDashboardCardsProps) {
  const { tetoLiberacao } = useMetasTetos();
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [liberatedValue, setLiberatedValue] = useState(0);
  const [liberatedCount, setLiberatedCount] = useState(0);
  const [salarioFixo, setSalarioFixo] = useState(0);
  const [comissaoPercentual, setComissaoPercentual] = useState(0);
  const [tipoRegime, setTipoRegime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const tenantId = await getResolvedTenantId();
    if (!tenantId) { setLoading(false); return; }

    // 1. Get user salary info
    const { data: userData } = await supabase
      .from("usuarios")
      .select("salario_fixo, comissao_percentual, tipo_regime, nome_completo, apelido")
      .eq("id", userId)
      .single();

    if (userData) {
      setSalarioFixo(Number(userData.salario_fixo) || 0);
      setComissaoPercentual(Number(userData.comissao_percentual) || 0);
      setTipoRegime(userData.tipo_regime);
    }

    // 2. Get clients in "em_liberado" (queue) — ordered by updated_at
    const { data: queueClients } = await supabase
      .from("clients")
      .select("id, nome, vendedor, updated_at")
      .eq("tenant_id", tenantId)
      .eq("status", "em_liberado")
      .order("updated_at", { ascending: true });

    const queue = (queueClients || []) as any[];
    setQueueTotal(queue.length);

    const userNameLower = (userName || userData?.nome_completo || userData?.apelido || "").toLowerCase();
    
    // Find user's position in queue (by assignment or order)
    const items: QueueItem[] = queue.map((c, idx) => ({
      clientName: c.nome,
      position: idx + 1,
      assignedTo: c.vendedor,
    }));
    setQueueItems(items);

    // User's position: find first client assigned to them, or their position in the overall queue
    const myPosition = items.findIndex(item => {
      const assignee = (item.assignedTo || "").toLowerCase();
      return assignee.includes(userNameLower) || userNameLower.includes(assignee);
    });
    setQueuePosition(myPosition >= 0 ? myPosition + 1 : null);

    // 3. Get liberated values this month (clients that moved past em_liberado)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    
    // Get client_tracking with status changes to track liberations
    const { data: trackingData } = await supabase
      .from("client_tracking")
      .select("client_id, valor_contrato, updated_at")
      .eq("tenant_id", tenantId)
      .gte("updated_at", monthStart);

    // Get status history for liberations done by this user
    const { data: historyData } = await supabase
      .from("client_status_history" as any)
      .select("client_id, novo_status, created_at, alterado_por")
      .eq("tenant_id", tenantId)
      .gte("created_at", monthStart);

    // Count liberations: transitions from em_liberado to next status by this user
    const liberatedClientIds = new Set<string>();
    (historyData as any[] || []).forEach((h: any) => {
      const alteredBy = (h.alterado_por || "").toLowerCase();
      if (
        (h.novo_status === "em_compras" || h.novo_status === "enviado_compras") &&
        (alteredBy.includes(userNameLower) || userNameLower.includes(alteredBy) || alteredBy === userId)
      ) {
        liberatedClientIds.add(h.client_id);
      }
    });

    // Sum values from tracking
    let totalLiberated = 0;
    const trackingMap = new Map<string, number>();
    (trackingData as any[] || []).forEach((t: any) => {
      trackingMap.set(t.client_id, Number(t.valor_contrato) || 0);
    });

    liberatedClientIds.forEach(cid => {
      totalLiberated += trackingMap.get(cid) || 0;
    });

    setLiberatedValue(totalLiberated);
    setLiberatedCount(liberatedClientIds.size);
    setLoading(false);
  }, [userId, userName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("tech-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "clients", filter: `status=eq.em_liberado` }, () => fetchData())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "client_status_history" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const tetoValue = tetoLiberacao?.valor || 0;
  const tetoPercent = tetoValue > 0 ? Math.min(100, (liberatedValue / tetoValue) * 100) : 0;
  const faltaParaTeto = Math.max(0, tetoValue - liberatedValue);

  // Salary preview calculation
  const comissaoSobreLiberacao = liberatedValue * (comissaoPercentual / 100);
  const salarioPrevisto = salarioFixo + comissaoSobreLiberacao;

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-40 animate-pulse bg-muted rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Card 1: Queue Position */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/15">
              <ListOrdered className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Fila de Liberação</h3>
              <p className="text-[10px] text-muted-foreground">Sua posição na fila</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              <p className="text-3xl font-bold text-primary">
                {queuePosition !== null ? `${queuePosition}º` : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">Posição</p>
            </div>
            <div className="w-px h-12 bg-border" />
            <div className="text-center flex-1">
              <p className="text-3xl font-bold text-foreground">{queueTotal}</p>
              <p className="text-[10px] text-muted-foreground">Total na Fila</p>
            </div>
          </div>

          {queuePosition !== null && queuePosition <= 3 && (
            <Badge variant="default" className="w-full justify-center text-xs">
              🔔 Você é o próximo!
            </Badge>
          )}
          {queuePosition === null && queueTotal > 0 && (
            <Badge variant="secondary" className="w-full justify-center text-xs">
              Nenhum item atribuído a você
            </Badge>
          )}
          {queueTotal === 0 && (
            <Badge variant="outline" className="w-full justify-center text-xs">
              Fila vazia no momento
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Card 2: Release Ceiling */}
      <Card className="border-accent/30 bg-gradient-to-br from-accent/5 to-accent/10">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-accent/15">
              <Target className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Teto de Liberação</h3>
              <p className="text-[10px] text-muted-foreground">Mês atual • {liberatedCount} liberações</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-sm font-bold text-primary">{formatCurrency(liberatedValue)}</p>
              <p className="text-[10px] text-muted-foreground">Liberado</p>
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{formatCurrency(tetoValue)}</p>
              <p className="text-[10px] text-muted-foreground">Teto</p>
            </div>
            <div>
              <p className="text-sm font-bold text-destructive">{formatCurrency(faltaParaTeto)}</p>
              <p className="text-[10px] text-muted-foreground">Faltante</p>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Progresso</span>
              <span>{tetoPercent.toFixed(1)}%</span>
            </div>
            <Progress value={tetoPercent} className="h-2.5" />
          </div>

          {tetoPercent >= 100 && (
            <Badge variant="default" className="w-full justify-center text-xs bg-green-600">
              ✅ Teto atingido!
            </Badge>
          )}
          {tetoValue === 0 && (
            <p className="text-[10px] text-muted-foreground text-center italic">
              Nenhum teto configurado para este mês
            </p>
          )}
        </CardContent>
      </Card>

      {/* Card 3: Salary Preview */}
      <Card className="border-green-500/30 bg-gradient-to-br from-green-500/5 to-green-500/10">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-green-500/15">
              <Wallet className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Prévia do Salário</h3>
              <p className="text-[10px] text-muted-foreground">
                {tipoRegime ? `Regime: ${tipoRegime.toUpperCase()}` : "Mês atual"}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Salário Fixo</span>
              <span className="text-sm font-semibold text-foreground">{formatCurrency(salarioFixo)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                Comissão ({comissaoPercentual}%)
              </span>
              <span className="text-sm font-semibold text-primary">{formatCurrency(comissaoSobreLiberacao)}</span>
            </div>
            <div className="h-px bg-border" />
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-foreground">Total Previsto</span>
              <span className="text-lg font-bold text-green-600">{formatCurrency(salarioPrevisto)}</span>
            </div>
          </div>

          <p className="text-[9px] text-muted-foreground text-center italic">
            * Valores sujeitos a descontos legais (INSS, IRRF, etc.)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
