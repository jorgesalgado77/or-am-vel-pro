/**
 * SalesGoalsPanel — Monthly sales goals per seller with progress bars and deadline alerts
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Target, Plus, Pencil, Trash2, Loader2, AlertTriangle, Clock,
  TrendingUp, Award, CalendarDays,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, differenceInDays, endOfMonth, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SalesGoal {
  id: string;
  tenant_id: string;
  user_id: string;
  user_name: string;
  goal_type: "revenue" | "deals" | "leads";
  target_value: number;
  current_value: number;
  month: string; // YYYY-MM
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
  return format(new Date(), "yyyy-MM");
}

interface SalesGoalsPanelProps {
  tenantId: string | null;
}

export function SalesGoalsPanel({ tenantId }: SalesGoalsPanelProps) {
  const [goals, setGoals] = useState<SalesGoal[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [form, setForm] = useState({
    id: "",
    user_id: "",
    goal_type: "revenue" as "revenue" | "deals" | "leads",
    target_value: 0,
  });

  const loadUsers = useCallback(async () => {
    if (!tenantId) return;
    // Load users with cargo info — only show vendedor/projetista
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
  }, [tenantId]);

  const loadGoals = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);

    // Load goals from sales_goals (localStorage fallback if table doesn't exist)
    const { data: goalsData, error } = await supabase
      .from("sales_goals" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("month", selectedMonth);

    if (error) {
      // Fallback to localStorage if table doesn't exist yet
      const stored = localStorage.getItem(`sales_goals_${tenantId}_${selectedMonth}`);
      if (stored) {
        setGoals(JSON.parse(stored));
      } else {
        setGoals([]);
      }
      setLoading(false);
      return;
    }

    // Enrich with user names and compute current values
    const userMap = new Map(users.map(u => [u.id, u.nome_completo]));

    // Get real data for current values
    const { data: clients } = await supabase
      .from("clients" as any)
      .select("responsavel_id, status, valor_fechamento, created_at")
      .eq("tenant_id", tenantId);

    const monthStart = startOfMonth(new Date(selectedMonth + "-01"));
    const monthEnd = endOfMonth(new Date(selectedMonth + "-01"));

    const enriched = (goalsData as any[]).map((g: any) => {
      let currentValue = 0;
      const monthClients = (clients || []).filter((c: any) => {
        const d = new Date(c.created_at);
        return d >= monthStart && d <= monthEnd && c.responsavel_id === g.user_id;
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

    setGoals(enriched);
    setLoading(false);
  }, [tenantId, selectedMonth, users]);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { if (users.length > 0) loadGoals(); }, [loadGoals, users]);

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
      // Fallback: save to localStorage
      const key = `sales_goals_${tenantId}_${selectedMonth}`;
      const stored = JSON.parse(localStorage.getItem(key) || "[]");
      const newGoal = { ...payload, id: form.id || crypto.randomUUID(), user_name: users.find(u => u.id === form.user_id)?.nome_completo || "", current_value: 0, created_at: new Date().toISOString() };
      if (form.id) {
        const idx = stored.findIndex((g: any) => g.id === form.id);
        if (idx >= 0) stored[idx] = newGoal;
      } else {
        stored.push(newGoal);
      }
      localStorage.setItem(key, JSON.stringify(stored));
      toast.success("Meta salva (local)!");
      setGoals(stored);
    } else {
      toast.success("Meta salva!");
      await loadGoals();
    }

    setDialogOpen(false);
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("sales_goals" as any).delete().eq("id", id);
    if (error) {
      const key = `sales_goals_${tenantId}_${selectedMonth}`;
      const stored = JSON.parse(localStorage.getItem(key) || "[]").filter((g: any) => g.id !== id);
      localStorage.setItem(key, JSON.stringify(stored));
      setGoals(stored);
    } else {
      await loadGoals();
    }
    toast.success("Meta removida");
  };

  const openNew = () => {
    setForm({ id: "", user_id: "", goal_type: "revenue", target_value: 0 });
    setDialogOpen(true);
  };

  const openEdit = (g: SalesGoal) => {
    setForm({ id: g.id, user_id: g.user_id, goal_type: g.goal_type, target_value: g.target_value });
    setDialogOpen(true);
  };

  // Deadline calculations
  const now = new Date();
  const monthEnd = endOfMonth(new Date(selectedMonth + "-01"));
  const daysRemaining = Math.max(0, differenceInDays(monthEnd, now));
  const isCurrentMonth = selectedMonth === getCurrentMonth();

  // Month options
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
          {isCurrentMonth && (
            <Badge variant={daysRemaining <= 5 ? "destructive" : "secondary"} className="text-xs gap-1">
              <Clock className="h-3 w-3" />
              {daysRemaining}d restantes
            </Badge>
          )}
        </div>
        <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={openNew}>
          <Plus className="h-3.5 w-3.5" /> Nova Meta
        </Button>
      </div>

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

      {/* Create/Edit Dialog */}
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
              <Select value={form.goal_type} onValueChange={v => setForm(f => ({ ...f, goal_type: v as any }))}>
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
