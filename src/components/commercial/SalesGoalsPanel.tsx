/**
 * SalesGoalsPanel — Monthly sales goals per seller with progress bars, deadline alerts, and Realtime sync
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Target, Plus, Pencil, Trash2, Loader2, AlertTriangle, Clock,
  TrendingUp, Award, CalendarDays, ShieldAlert, Copy,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { supabase } from "@/lib/supabaseClient";
import { useMetasTetos } from "@/hooks/useMetasTetos";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, getDaysInMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SalesGoal {
  id: string;
  tenant_id: string;
  user_id: string;
  user_name: string;
  goal_type: "revenue" | "deals" | "leads";
  target_value: number;
  current_value: number;
  month: string;
  created_at: string;
}

interface UserOption {
  id: string;
  nome_completo: string;
}

const GOAL_TYPE_LABELS: Record<string, { label: string; icon: typeof Target; unit: string }> = {
  revenue: { label: "Faturamento", icon: TrendingUp, unit: "R$" },
  deals: { label: "Vendas Fechadas", icon: Award, unit: "" },
  leads: { label: "Leads Convertidos", icon: Target, unit: "" },
};

function formatCurrency(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthInfo(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const totalDays = getDaysInMonth(new Date(y, m - 1, 15));
  const now = new Date();
  const cy = now.getFullYear(), cm = now.getMonth() + 1, cd = now.getDate();
  const isSameMonth = y === cy && m === cm;
  const isPast = y < cy || (y === cy && m < cm);
  const isFuture = y > cy || (y === cy && m > cm);
  const daysRemaining = isPast ? 0 : isFuture ? totalDays : Math.max(0, totalDays - cd);
  return { totalDays, daysRemaining, isPast, isFuture, isSameMonth };
}

interface SalesGoalsPanelProps {
  tenantId: string | null;
}

export function SalesGoalsPanel({ tenantId }: SalesGoalsPanelProps) {
  const [rawGoals, setRawGoals] = useState<SalesGoal[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [form, setForm] = useState({
    id: "",
    user_id: "",
    goal_type: "revenue" as "revenue" | "deals" | "leads",
    target_value: 0,
  });

  // Get admin-configured default meta for vendedor
  const { metaVendedor } = useMetasTetos(selectedMonth);

  // Deduplicate goals by id
  const goals = useMemo(() => {
    const map = new Map<string, SalesGoal>();
    for (const g of rawGoals) {
      map.set(g.id, g);
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [rawGoals]);

  const loadUsers = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("usuarios" as any)
      .select("id, nome_completo, cargo_id, cargos(nome)")
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .order("nome_completo");
    if (data) {
      const filtered = (data as any[]).filter((u: any) => {
        const cargoNome = u.cargos?.nome?.toLowerCase() || "";
        return cargoNome.includes("vendedor") || cargoNome.includes("projetista");
      });
      setUsers(filtered.map((u: any) => ({ id: u.id, nome_completo: u.nome_completo })));
    }
    setUsersLoaded(true);
  }, [tenantId]);

  const loadGoals = useCallback(async (userList?: UserOption[]) => {
    if (!tenantId) return;
    setLoading(true);

    const effectiveUsers = userList || users;

    const { data: goalsData, error } = await supabase
      .from("sales_goals" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("month", selectedMonth);

    if (error) {
      const stored = localStorage.getItem(`sales_goals_${tenantId}_${selectedMonth}`);
      setRawGoals(stored ? JSON.parse(stored) : []);
      setLoading(false);
      return;
    }

    const userMap = new Map(effectiveUsers.map(u => [u.id, u.nome_completo]));

    const { data: clients } = await supabase
      .from("clients" as any)
      .select("responsavel_id, status, valor_fechamento, created_at")
      .eq("tenant_id", tenantId);

    const enriched = (goalsData as any[] || []).map((g: any) => {
      let currentValue = 0;
      const monthClients = (clients || []).filter((c: any) => {
        return (c.created_at || "").substring(0, 7) === selectedMonth && c.responsavel_id === g.user_id;
      });

      if (g.goal_type === "revenue") {
        currentValue = monthClients
          .filter((c: any) => c.status === "fechado")
          .reduce((sum: number, c: any) => sum + (Number(c.valor_fechamento) || 0), 0);
      } else if (g.goal_type === "deals") {
        currentValue = monthClients.filter((c: any) => c.status === "fechado").length;
      } else if (g.goal_type === "leads") {
        currentValue = monthClients.length;
      }

      return {
        ...g,
        user_name: userMap.get(g.user_id) || "Desconhecido",
        current_value: currentValue,
      };
    });

    // Replace state entirely to avoid duplicates
    setRawGoals(enriched);
    setLoading(false);
  }, [tenantId, selectedMonth, users]);

  // Load users first, then goals
  useEffect(() => { loadUsers(); }, [loadUsers]);
  
  useEffect(() => {
    if (usersLoaded) loadGoals();
  }, [usersLoaded, loadGoals]);

  // Realtime subscription
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`sales-goals-rt-${tenantId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "sales_goals",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload: any) => {
          if (payload.eventType === "DELETE") {
            const oldId = payload.old?.id;
            if (oldId) setRawGoals(prev => prev.filter(g => g.id !== oldId));
          } else {
            loadGoals();
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantId, loadGoals]);

  const handleSave = async () => {
    if (!tenantId || !form.user_id || form.target_value <= 0) {
      toast.error("Preencha todos os campos");
      return;
    }
    setSaving(true);

    const payload = {
      tenant_id: tenantId,
      user_id: form.user_id,
      goal_type: form.goal_type,
      target_value: form.target_value,
      month: selectedMonth,
    };

    let error;
    if (form.id) {
      ({ error } = await supabase.from("sales_goals" as any).update(payload as any).eq("id", form.id));
    } else {
      ({ error } = await supabase.from("sales_goals" as any).insert(payload as any));
    }

    if (error) {
      const key = `sales_goals_${tenantId}_${selectedMonth}`;
      const stored = JSON.parse(localStorage.getItem(key) || "[]");
      const newGoal = {
        ...payload,
        id: form.id || crypto.randomUUID(),
        user_name: users.find(u => u.id === form.user_id)?.nome_completo || "",
        current_value: 0,
        created_at: new Date().toISOString(),
      };
      if (form.id) {
        const idx = stored.findIndex((g: any) => g.id === form.id);
        if (idx >= 0) stored[idx] = newGoal;
      } else {
        stored.push(newGoal);
      }
      localStorage.setItem(key, JSON.stringify(stored));
      toast.success("Meta salva (local)!");
      setRawGoals(stored);
    } else {
      toast.success("Meta salva!");
      await loadGoals();
    }

    setDialogOpen(false);
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setRawGoals(prev => prev.filter(g => g.id !== id));
    const { error } = await supabase.from("sales_goals" as any).delete().eq("id", id);
    if (error) {
      const key = `sales_goals_${tenantId}_${selectedMonth}`;
      const stored = JSON.parse(localStorage.getItem(key) || "[]").filter((g: any) => g.id !== id);
      localStorage.setItem(key, JSON.stringify(stored));
      setRawGoals(stored);
    }
    toast.success("Meta removida");
  };

  const openNew = () => {
    // Pre-fill with admin-configured default meta vendedor value
    const defaultValue = (metaVendedor?.valor && form.goal_type === "revenue") ? metaVendedor.valor : 0;
    setForm({ id: "", user_id: "", goal_type: "revenue", target_value: defaultValue });
    setDialogOpen(true);
  };

  const openEdit = (g: SalesGoal) => {
    setForm({ id: g.id, user_id: g.user_id, goal_type: g.goal_type, target_value: g.target_value });
    setDialogOpen(true);
  };

  // When goal_type changes in dialog to revenue, pre-fill default if empty
  const handleGoalTypeChange = (v: string) => {
    const newType = v as "revenue" | "deals" | "leads";
    setForm(f => ({
      ...f,
      goal_type: newType,
      target_value: (newType === "revenue" && f.target_value === 0 && metaVendedor?.valor)
        ? metaVendedor.valor
        : f.target_value,
    }));
  };

  const { daysRemaining, isPast: isPastMonth, isSameMonth: isCurrentMonth, totalDays } = getMonthInfo(selectedMonth);

  const monthOptions = [];
  for (let i = -2; i <= 2; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    monthOptions.push({
      value: format(d, "yyyy-MM"),
      label: format(d, "MMMM yyyy", { locale: ptBR }),
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[180px] h-8 text-sm">
              <CalendarDays className="h-3.5 w-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map(m => (
                <SelectItem key={m.value} value={m.value} className="capitalize">{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge
            variant={isPastMonth ? "outline" : daysRemaining <= 5 ? "destructive" : "secondary"}
            className="text-xs gap-1"
          >
            <Clock className="h-3 w-3" />
            {isPastMonth
              ? "Encerrado"
              : isCurrentMonth
                ? `${daysRemaining} de ${totalDays} dias restantes`
                : `${totalDays} dias no mês`}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={handleDuplicatePreviousMonth} disabled={saving}>
            <Copy className="h-3.5 w-3.5" /> Duplicar Mês Anterior
          </Button>
          <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={openNew}>
            <Plus className="h-3.5 w-3.5" /> Nova Meta
          </Button>
        </div>
      </div>

      {/* Automatic alerts */}
      {isCurrentMonth && daysRemaining <= 7 && !loading && (() => {
        const atRisk = goals.filter(g => {
          const pct = g.target_value > 0 ? (g.current_value / g.target_value) * 100 : 0;
          return pct < 50;
        });
        if (atRisk.length === 0) return null;
        return (
          <Alert variant="destructive" className="border-destructive/60 bg-destructive/10">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle className="text-sm font-semibold">⚠️ Alerta de Risco — {atRisk.length} meta(s) crítica(s)</AlertTitle>
            <AlertDescription className="text-xs space-y-1 mt-1">
              <p>Faltam apenas <strong>{daysRemaining} dia(s)</strong> para o fim do mês e as metas abaixo estão com menos de 50% de progresso:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {atRisk.map(g => {
                  const pct = g.target_value > 0 ? (g.current_value / g.target_value) * 100 : 0;
                  const tc = GOAL_TYPE_LABELS[g.goal_type] || GOAL_TYPE_LABELS.revenue;
                  return (
                    <li key={`alert-${g.id}`}>
                      <strong>{g.user_name}</strong> — {tc.label}: {pct.toFixed(0)}% atingido
                      ({g.goal_type === "revenue" ? formatCurrency(g.current_value) : g.current_value} de {g.goal_type === "revenue" ? formatCurrency(g.target_value) : g.target_value})
                    </li>
                  );
                })}
              </ul>
            </AlertDescription>
          </Alert>
        );
      })()}

      {/* Bar Chart — Seller comparison */}
      {!loading && goals.filter(g => g.goal_type === "revenue").length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Comparativo de Vendedores — Faturamento
            </h4>
            <ResponsiveContainer width="100%" height={Math.max(200, goals.filter(g => g.goal_type === "revenue").length * 60)}>
              <BarChart
                data={goals.filter(g => g.goal_type === "revenue").map(g => ({
                  name: g.user_name.split(" ")[0],
                  meta: g.target_value,
                  atual: g.current_value,
                  pct: g.target_value > 0 ? Math.round((g.current_value / g.target_value) * 100) : 0,
                }))}
                layout="vertical"
                margin={{ left: 10, right: 30, top: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis type="number" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} fontSize={10} />
                <YAxis type="category" dataKey="name" width={70} fontSize={11} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend fontSize={10} />
                <Bar dataKey="meta" name="Meta" fill="hsl(var(--muted-foreground))" opacity={0.3} radius={[0, 4, 4, 0]} />
                <Bar dataKey="atual" name="Realizado" radius={[0, 4, 4, 0]}>
                  {goals.filter(g => g.goal_type === "revenue").map((g, i) => {
                    const pct = g.target_value > 0 ? (g.current_value / g.target_value) * 100 : 0;
                    return <Cell key={i} fill={pct >= 100 ? "hsl(142 71% 45%)" : pct >= 60 ? "hsl(var(--primary))" : "hsl(var(--destructive))"} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Goals List */}
      {loading ? (
        <div className="text-center py-8">
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
        </div>
      ) : goals.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Target className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>Nenhuma meta definida para este mês</p>
            <p className="text-xs">Crie metas para acompanhar o desempenho da equipe</p>
            {metaVendedor && (
              <p className="text-xs text-primary mt-1">
                Meta padrão do administrador: {formatCurrency(metaVendedor.valor)} por vendedor
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => {
            const progress = g.target_value > 0 ? Math.min(100, (g.current_value / g.target_value) * 100) : 0;
            const typeConfig = GOAL_TYPE_LABELS[g.goal_type] || GOAL_TYPE_LABELS.revenue;
            const Icon = typeConfig.icon;
            const isNearDeadline = isCurrentMonth && daysRemaining <= 7 && progress < 80;
            const isAchieved = progress >= 100;

            return (
              <Card
                key={g.id}
                className={cn(
                  "transition-all",
                  isAchieved && "border-emerald-500/50 bg-emerald-500/5",
                  isNearDeadline && !isAchieved && "border-destructive/50 bg-destructive/5",
                )}
              >
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "p-1.5 rounded-lg",
                        isAchieved ? "bg-emerald-500/10" : isNearDeadline ? "bg-destructive/10" : "bg-muted",
                      )}>
                        <Icon className={cn(
                          "h-4 w-4",
                          isAchieved ? "text-emerald-600" : isNearDeadline ? "text-destructive" : "text-muted-foreground",
                        )} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{g.user_name}</p>
                        <p className="text-xs text-muted-foreground">{typeConfig.label}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {isAchieved && <Badge className="bg-emerald-500 text-white text-[10px]">✓ Atingida</Badge>}
                      {isNearDeadline && !isAchieved && (
                        <Badge variant="destructive" className="text-[10px] gap-0.5">
                          <AlertTriangle className="h-3 w-3" /> Prazo
                        </Badge>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(g)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(g.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {g.goal_type === "revenue"
                          ? `${formatCurrency(g.current_value)} / ${formatCurrency(g.target_value)}`
                          : `${g.current_value} / ${g.target_value}`
                        }
                      </span>
                      <span className={cn(
                        "font-semibold",
                        isAchieved ? "text-emerald-600" : progress >= 60 ? "text-primary" : "text-muted-foreground",
                      )}>
                        {progress.toFixed(0)}%
                      </span>
                    </div>
                    <Progress
                      value={progress}
                      className={cn(
                        "h-2",
                        isAchieved && "[&>div]:bg-emerald-500",
                        isNearDeadline && !isAchieved && "[&>div]:bg-destructive",
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Manager summary cards */}
      {!loading && goals.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            Resumo do Gerente Comercial
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(() => {
              const revGoals = goals.filter(g => g.goal_type === "revenue");
              const totalTarget = revGoals.reduce((s, g) => s + g.target_value, 0);
              const totalCurrent = revGoals.reduce((s, g) => s + g.current_value, 0);
              const overallPct = totalTarget > 0 ? Math.min(100, (totalCurrent / totalTarget) * 100) : 0;

              const dealGoals = goals.filter(g => g.goal_type === "deals");
              const dealsTarget = dealGoals.reduce((s, g) => s + g.target_value, 0);
              const dealsCurrent = dealGoals.reduce((s, g) => s + g.current_value, 0);
              const dealsPct = dealsTarget > 0 ? Math.min(100, (dealsCurrent / dealsTarget) * 100) : 0;

              return (
                <>
                  {totalTarget > 0 && (
                    <Card className={cn("border-l-4", overallPct >= 100 ? "border-l-emerald-500" : overallPct >= 60 ? "border-l-primary" : "border-l-amber-500")}>
                      <CardContent className="pt-3 pb-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground font-medium">Faturamento da Equipe</p>
                          <span className={cn("text-sm font-bold", overallPct >= 100 ? "text-emerald-600" : "text-foreground")}>{overallPct.toFixed(0)}%</span>
                        </div>
                        <Progress value={overallPct} className={cn("h-2", overallPct >= 100 && "[&>div]:bg-emerald-500")} />
                        <p className="text-[11px] text-muted-foreground">{formatCurrency(totalCurrent)} de {formatCurrency(totalTarget)}</p>
                      </CardContent>
                    </Card>
                  )}
                  {dealsTarget > 0 && (
                    <Card className={cn("border-l-4", dealsPct >= 100 ? "border-l-emerald-500" : dealsPct >= 60 ? "border-l-primary" : "border-l-amber-500")}>
                      <CardContent className="pt-3 pb-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground font-medium">Vendas Fechadas (Equipe)</p>
                          <span className={cn("text-sm font-bold", dealsPct >= 100 ? "text-emerald-600" : "text-foreground")}>{dealsPct.toFixed(0)}%</span>
                        </div>
                        <Progress value={dealsPct} className={cn("h-2", dealsPct >= 100 && "[&>div]:bg-emerald-500")} />
                        <p className="text-[11px] text-muted-foreground">{dealsCurrent} de {dealsTarget} vendas</p>
                      </CardContent>
                    </Card>
                  )}
                  {goals.map((g) => {
                    const pct = g.target_value > 0 ? Math.min(100, (g.current_value / g.target_value) * 100) : 0;
                    const tc = GOAL_TYPE_LABELS[g.goal_type] || GOAL_TYPE_LABELS.revenue;
                    return (
                      <Card key={`mgr-${g.id}`} className="border-l-4 border-l-muted">
                        <CardContent className="pt-3 pb-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium truncate">{g.user_name}</p>
                            <Badge variant={pct >= 100 ? "default" : "outline"} className="text-[10px]">{pct.toFixed(0)}%</Badge>
                          </div>
                          <Progress value={pct} className={cn("h-1.5", pct >= 100 && "[&>div]:bg-emerald-500")} />
                          <p className="text-[10px] text-muted-foreground">
                            {tc.label}: {g.goal_type === "revenue" ? formatCurrency(g.current_value) : g.current_value} / {g.goal_type === "revenue" ? formatCurrency(g.target_value) : g.target_value}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </>
              );
            })()}
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              {form.id ? "Editar Meta" : "Nova Meta Mensal"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Vendedor</Label>
              <Select value={form.user_id} onValueChange={v => setForm(f => ({ ...f, user_id: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione o vendedor" />
                </SelectTrigger>
                <SelectContent>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.nome_completo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo de Meta</Label>
              <Select value={form.goal_type} onValueChange={handleGoalTypeChange}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue">💰 Faturamento (R$)</SelectItem>
                  <SelectItem value="deals">🤝 Vendas Fechadas</SelectItem>
                  <SelectItem value="leads">👥 Leads Convertidos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">
                Valor da Meta {form.goal_type === "revenue" ? "(R$)" : "(quantidade)"}
              </Label>
              {metaVendedor && form.goal_type === "revenue" && !form.id && (
                <p className="text-[10px] text-primary mb-1">
                  Padrão definido pelo administrador: {formatCurrency(metaVendedor.valor)}
                </p>
              )}
              {form.goal_type === "revenue" ? (
                <Input
                  value={form.target_value > 0 ? form.target_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : ""}
                  onChange={e => {
                    const digits = e.target.value.replace(/\D/g, "");
                    setForm(f => ({ ...f, target_value: digits ? parseInt(digits, 10) / 100 : 0 }));
                  }}
                  placeholder="R$ 0,00"
                  className="mt-1"
                />
              ) : (
                <Input
                  type="number"
                  min={1}
                  value={form.target_value || ""}
                  onChange={e => setForm(f => ({ ...f, target_value: Number(e.target.value) }))}
                  placeholder="Ex: 10"
                  className="mt-1"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
