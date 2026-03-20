import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { toast } from "sonner";
import { format, addDays, isPast, isAfter, isBefore, eachDayOfInterval, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/financing";
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, Plus, Trash2,
  Save, Pencil, X, Search, RefreshCw, Receipt, Users, Target,
  ArrowUpRight, ArrowDownRight, CalendarDays, Bell, CheckCircle2,
  Brain, Sparkles, Loader2, FileDown
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Area, AreaChart, ReferenceLine, Legend
} from "recharts";

interface FinancialAccount {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  due_date: string;
  status: "pendente" | "pago" | "atrasado";
  is_fixed: boolean;
  recurrence_type: string | null;
  category: string | null;
  created_at: string;
}

interface PayrollFixed {
  id: string;
  usuario_id: string;
  usuario_nome: string;
  salary: number;
  type: string;
}

interface PayrollCommission {
  usuario_id: string;
  usuario_nome: string;
  total_comissao: number;
  total_vendas: number;
}

const STATUS_MAP = {
  pendente: { label: "Pendente", color: "bg-amber-500/10 text-amber-700 border-amber-200" },
  pago: { label: "Pago", color: "bg-green-500/10 text-green-700 border-green-200" },
  atrasado: { label: "Atrasado", color: "bg-red-500/10 text-red-700 border-red-200" },
};

const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

export function FinancialPanel() {
  const tenantId = getTenantId();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    name: "", description: "", amount: 0, due_date: format(new Date(), "yyyy-MM-dd"),
    status: "pendente" as "pendente" | "pago" | "atrasado", is_fixed: false, recurrence_type: "", category: ""
  });

  // Payroll data
  const [payrollFixed, setPayrollFixed] = useState<PayrollFixed[]>([]);
  const [commissions, setCommissions] = useState<PayrollCommission[]>([]);
  const [faturamento, setFaturamento] = useState(0);

  // AI Forecast state
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [forecastCache, setForecastCache] = useState<{ data: any[]; timestamp: number } | null>(null);
  const [notifications, setNotifications] = useState<{ id: string; message: string; type: string; read: boolean }[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const fetchData = async () => {
    if (!tenantId) return;
    setLoading(true);

    // Fetch financial accounts
    const { data: accs } = await supabase
      .from("financial_accounts" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("due_date", { ascending: true });
    if (accs) {
      // Auto-update overdue status
      const updated = (accs as any[]).map(a => ({
        ...a,
        status: a.status === "pendente" && isPast(new Date(a.due_date)) ? "atrasado" : a.status
      }));
      setAccounts(updated as FinancialAccount[]);
    }

    // Fetch payroll fixed salaries
    const { data: pf } = await supabase
      .from("payroll_fixed" as any)
      .select("*, usuarios!inner(nome_completo)")
      .eq("tenant_id", tenantId);
    if (pf) {
      setPayrollFixed((pf as any[]).map(p => ({
        id: p.id,
        usuario_id: p.usuario_id,
        usuario_nome: p.usuarios?.nome_completo || "—",
        salary: p.salary,
        type: p.type
      })));
    }

    // Fetch commissions from payroll_commissions (current month)
    const mesRef = format(new Date(), "yyyy-MM");
    const { data: comms } = await supabase
      .from("payroll_commissions" as any)
      .select("usuario_id, valor_comissao, valor_base")
      .eq("tenant_id", tenantId)
      .eq("mes_referencia", mesRef);
    if (comms) {
      const grouped: Record<string, PayrollCommission> = {};
      (comms as any[]).forEach(c => {
        if (!grouped[c.usuario_id]) {
          grouped[c.usuario_id] = { usuario_id: c.usuario_id, usuario_nome: "", total_comissao: 0, total_vendas: 0 };
        }
        grouped[c.usuario_id].total_comissao += c.valor_comissao || 0;
        grouped[c.usuario_id].total_vendas += c.valor_base || 0;
      });
      setCommissions(Object.values(grouped));
    }

    // Fetch revenue from simulations (current month)
    const { data: sims } = await supabase
      .from("simulations" as any)
      .select("valor_final")
      .eq("tenant_id", tenantId)
      .gte("created_at", `${mesRef}-01`);
    if (sims) {
      const total = (sims as any[]).reduce((sum, s) => sum + (s.valor_final || 0), 0);
      setFaturamento(total);
    }

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [tenantId]);

  // === CALCULATIONS ===
  const totalContasPagar = useMemo(() =>
    accounts.filter(a => a.status !== "pago").reduce((sum, a) => sum + a.amount, 0), [accounts]);

  const contasVencidas = useMemo(() =>
    accounts.filter(a => a.status === "atrasado"), [accounts]);

  const contasAVencer7d = useMemo(() =>
    accounts.filter(a => {
      if (a.status === "pago") return false;
      const due = new Date(a.due_date);
      const limit = addDays(new Date(), 7);
      return isAfter(due, new Date()) && isBefore(due, limit);
    }), [accounts]);

  const contasFixas = useMemo(() =>
    accounts.filter(a => a.is_fixed).reduce((sum, a) => sum + a.amount, 0), [accounts]);

  const totalSalarios = useMemo(() =>
    payrollFixed.reduce((sum, p) => sum + p.salary, 0), [payrollFixed]);

  const totalComissoes = useMemo(() =>
    commissions.reduce((sum, c) => sum + c.total_comissao, 0), [commissions]);

  const totalFolha = totalSalarios + totalComissoes;
  const breakEven = contasFixas + totalFolha;
  const lucroEstimado = faturamento - breakEven;

  // Chart data
  const categoryData = useMemo(() => {
    const cats: Record<string, number> = {};
    accounts.forEach(a => {
      const cat = a.category || "Outros";
      cats[cat] = (cats[cat] || 0) + a.amount;
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value }));
  }, [accounts]);

  // === CASH FLOW FORECAST ===
  const forecastData = useMemo(() => {
    if (forecastCache && Date.now() - forecastCache.timestamp < 300000) return forecastCache.data;

    const today = new Date();
    const days = eachDayOfInterval({ start: today, end: addDays(today, 30) });
    let saldoAcumulado = faturamento - totalContasPagar;

    const dailyRevenue = faturamento / 30;
    const dailyCosts = (contasFixas + totalFolha) / 30;

    const data = days.map(day => {
      const dayStr = format(day, "yyyy-MM-dd");
      const dayAccounts = accounts.filter(a => a.due_date === dayStr && a.status !== "pago");
      const dayCost = dayAccounts.reduce((sum, a) => sum + a.amount, 0) || dailyCosts;
      
      saldoAcumulado += dailyRevenue - dayCost;
      
      return {
        dia: format(day, "dd/MM"),
        entradas: Math.round(dailyRevenue),
        saidas: Math.round(dayCost),
        saldo: Math.round(saldoAcumulado),
      };
    });

    setForecastCache({ data, timestamp: Date.now() });
    return data;
  }, [accounts, faturamento, contasFixas, totalFolha, totalContasPagar]);

  const saldoFinal30d = forecastData.length > 0 ? forecastData[forecastData.length - 1].saldo : 0;
  const diasNegativo = forecastData.filter(d => d.saldo < 0).length;

  const handleAIAnalysis = useCallback(async () => {
    setAiLoading(true);
    try {
      const resumo = `
Faturamento mensal: ${formatCurrency(faturamento)}
Custos fixos: ${formatCurrency(contasFixas)}
Folha total: ${formatCurrency(totalFolha)}
Ponto de equilíbrio: ${formatCurrency(breakEven)}
Resultado atual: ${formatCurrency(lucroEstimado)}
Contas vencidas: ${contasVencidas.length}
Contas a vencer (7 dias): ${contasAVencer7d.length}
Total a pagar: ${formatCurrency(totalContasPagar)}
Saldo projetado 30 dias: ${formatCurrency(saldoFinal30d)}
Dias com saldo negativo projetado: ${diasNegativo}
Categorias de despesa: ${categoryData.map(c => `${c.name}: ${formatCurrency(c.value)}`).join(", ")}
      `.trim();

      const { data, error } = await supabase.functions.invoke("cashflow-ai", {
        body: { resumo_financeiro: resumo },
      });
      if (error) throw error;
      setAiAnalysis(data.analise || "Sem análise disponível.");
    } catch (err: any) {
      console.error("AI analysis error:", err);
      toast.error("Erro ao gerar análise de IA");
    } finally {
      setAiLoading(false);
    }
  }, [faturamento, contasFixas, totalFolha, breakEven, lucroEstimado, contasVencidas, contasAVencer7d, totalContasPagar, saldoFinal30d, diasNegativo, categoryData]);
  // CRUD
  const handleSave = async () => {
    if (!form.name.trim() || form.amount <= 0) {
      toast.error("Nome e valor são obrigatórios");
      return;
    }
    const payload = {
      tenant_id: tenantId,
      name: form.name.trim(),
      description: form.description || null,
      amount: form.amount,
      due_date: form.due_date,
      status: form.status,
      is_fixed: form.is_fixed,
      recurrence_type: form.recurrence_type || null,
      category: form.category || null,
    };

    if (editing) {
      const { error } = await supabase.from("financial_accounts" as any).update(payload as any).eq("id", editing);
      if (error) toast.error("Erro ao atualizar");
      else { toast.success("Conta atualizada!"); setEditing(null); }
    } else {
      const { error } = await supabase.from("financial_accounts" as any).insert(payload as any);
      if (error) toast.error("Erro ao criar conta");
      else toast.success("Conta adicionada!");
    }
    resetForm();
    setShowAddDialog(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta conta?")) return;
    await supabase.from("financial_accounts" as any).delete().eq("id", id);
    toast.success("Conta excluída");
    fetchData();
  };

  const handleMarkPaid = async (id: string) => {
    await supabase.from("financial_accounts" as any).update({ status: "pago" } as any).eq("id", id);
    toast.success("Conta marcada como paga!");
    fetchData();
  };

  const resetForm = () => setForm({
    name: "", description: "", amount: 0, due_date: format(new Date(), "yyyy-MM-dd"),
    status: "pendente" as "pendente" | "pago" | "atrasado", is_fixed: false, recurrence_type: "", category: ""
  });

  const startEdit = (acc: FinancialAccount) => {
    setForm({
      name: acc.name, description: acc.description || "", amount: acc.amount,
      due_date: acc.due_date, status: acc.status, is_fixed: acc.is_fixed,
      recurrence_type: acc.recurrence_type || "", category: acc.category || ""
    });
    setEditing(acc.id);
    setShowAddDialog(true);
  };

  const filtered = accounts.filter(a => {
    if (filterStatus !== "todos" && a.status !== filterStatus) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-lg font-bold">{formatCurrency(totalContasPagar)}</p>
              <p className="text-xs text-muted-foreground">Total a Pagar</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-red-600">{contasVencidas.length}</p>
              <p className="text-xs text-muted-foreground">Contas Vencidas</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-lg font-bold">{contasAVencer7d.length}</p>
              <p className="text-xs text-muted-foreground">Vencem em 7 dias</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${lucroEstimado >= 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
              {lucroEstimado >= 0 ? <TrendingUp className="h-5 w-5 text-green-600" /> : <TrendingDown className="h-5 w-5 text-red-600" />}
            </div>
            <div>
              <p className={`text-lg font-bold ${lucroEstimado >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(Math.abs(lucroEstimado))}
              </p>
              <p className="text-xs text-muted-foreground">{lucroEstimado >= 0 ? "Lucro Estimado" : "Prejuízo Estimado"}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Break-even card */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 items-center">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Custos Fixos</p>
              <p className="font-bold text-sm">{formatCurrency(contasFixas)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Folha Total</p>
              <p className="font-bold text-sm">{formatCurrency(totalFolha)}</p>
            </div>
            <div className="text-center">
              <Target className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-xs text-muted-foreground mb-1">Ponto de Equilíbrio</p>
              <p className="font-bold text-primary">{formatCurrency(breakEven)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Faturamento Atual</p>
              <p className="font-bold text-sm">{formatCurrency(faturamento)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Resultado</p>
              <p className={`font-bold text-sm ${lucroEstimado >= 0 ? "text-green-600" : "text-red-600"}`}>
                {lucroEstimado >= 0 ? "+" : ""}{formatCurrency(lucroEstimado)}
              </p>
              {faturamento > 0 && (
                <div className="mt-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${lucroEstimado >= 0 ? "bg-green-500" : "bg-red-500"}`}
                    style={{ width: `${Math.min((faturamento / (breakEven || 1)) * 100, 100)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="contas">
        <TabsList className="flex-wrap">
          <TabsTrigger value="contas">Contas a Pagar</TabsTrigger>
          <TabsTrigger value="folha">Folha de Pagamento</TabsTrigger>
          <TabsTrigger value="previsao">📊 Previsão de Caixa</TabsTrigger>
          <TabsTrigger value="analise">Análise</TabsTrigger>
        </TabsList>

        {/* === CONTAS === */}
        <TabsContent value="contas" className="mt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar conta..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="atrasado">Atrasado</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </Button>
            <Button size="sm" onClick={() => { resetForm(); setEditing(null); setShowAddDialog(true); }} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Nova Conta
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conta</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="w-32">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p>Nenhuma conta cadastrada</p>
                      </TableCell>
                    </TableRow>
                  ) : filtered.map(acc => {
                    const st = STATUS_MAP[acc.status] || STATUS_MAP.pendente;
                    return (
                      <TableRow key={acc.id}>
                        <TableCell>
                          <p className="font-medium text-sm">{acc.name}</p>
                          {acc.description && <p className="text-xs text-muted-foreground">{acc.description}</p>}
                        </TableCell>
                        <TableCell><span className="text-sm">{acc.category || "—"}</span></TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatCurrency(acc.amount)}</TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {format(new Date(acc.due_date), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={st.color}>{st.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {acc.is_fixed ? (
                            <Badge variant="secondary" className="text-[10px]">Fixo • {acc.recurrence_type || "mensal"}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Variável</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {acc.status !== "pago" && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={() => handleMarkPaid(acc.id)} title="Marcar como pago">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(acc)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(acc.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === FOLHA === */}
        <TabsContent value="folha" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-lg font-bold">{formatCurrency(totalSalarios)}</p>
                  <p className="text-xs text-muted-foreground">Salários Fixos</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-lg font-bold">{formatCurrency(totalComissoes)}</p>
                  <p className="text-xs text-muted-foreground">Comissões do Mês</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-bold">{formatCurrency(totalFolha)}</p>
                  <p className="text-xs text-muted-foreground">Total Folha</p>
                </div>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Salários Fixos por Funcionário</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Salário</TableHead>
                    <TableHead className="text-right">Comissão Mês</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrollFixed.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        Nenhum salário fixo cadastrado. Use Configurações para adicionar.
                      </TableCell>
                    </TableRow>
                  ) : payrollFixed.map(pf => {
                    const comm = commissions.find(c => c.usuario_id === pf.usuario_id);
                    const commVal = comm?.total_comissao || 0;
                    return (
                      <TableRow key={pf.id}>
                        <TableCell className="font-medium">{pf.usuario_nome}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px]">{pf.type}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(pf.salary)}</TableCell>
                        <TableCell className="text-right tabular-nums text-green-600">{formatCurrency(commVal)}</TableCell>
                        <TableCell className="text-right font-bold tabular-nums">{formatCurrency(pf.salary + commVal)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        {/* === PREVISÃO DE CAIXA === */}
        <TabsContent value="previsao" className="mt-4 space-y-4">
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${saldoFinal30d >= 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
                  {saldoFinal30d >= 0 ? <TrendingUp className="h-5 w-5 text-green-600" /> : <TrendingDown className="h-5 w-5 text-red-600" />}
                </div>
                <div>
                  <p className={`text-lg font-bold ${saldoFinal30d >= 0 ? "text-green-600" : "text-red-600"}`}>{formatCurrency(saldoFinal30d)}</p>
                  <p className="text-xs text-muted-foreground">Saldo em 30 dias</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${diasNegativo > 0 ? "bg-red-500/10" : "bg-green-500/10"}`}>
                  <AlertTriangle className={`h-5 w-5 ${diasNegativo > 0 ? "text-red-600" : "text-green-600"}`} />
                </div>
                <div>
                  <p className={`text-lg font-bold ${diasNegativo > 0 ? "text-red-600" : "text-green-600"}`}>{diasNegativo}</p>
                  <p className="text-xs text-muted-foreground">Dias no Vermelho</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <ArrowUpRight className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-lg font-bold">{formatCurrency(faturamento / 30)}</p>
                  <p className="text-xs text-muted-foreground">Entrada Diária Média</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <ArrowDownRight className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-lg font-bold">{formatCurrency((contasFixas + totalFolha) / 30)}</p>
                  <p className="text-xs text-muted-foreground">Saída Diária Média</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Alert banner */}
          {diasNegativo > 0 && (
            <Card className="border-red-300 bg-red-50 dark:bg-red-950/30">
              <CardContent className="p-4 flex items-center gap-3">
                <Bell className="h-5 w-5 text-red-600 animate-pulse" />
                <div>
                  <p className="font-semibold text-red-800 dark:text-red-300 text-sm">⚠️ Alerta de Caixa Negativo</p>
                  <p className="text-xs text-red-600/80">Seu saldo ficará negativo em {diasNegativo} dos próximos 30 dias. Revise suas contas ou aumente o faturamento.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Forecast chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Previsão de Saldo — Próximos 30 Dias</CardTitle>
              <CardDescription className="text-xs">Baseado em receitas e despesas projetadas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecastData}>
                    <defs>
                      <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="dia" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                    <ReferenceLine y={0} stroke="hsl(0, 70%, 50%)" strokeDasharray="3 3" label="Zero" />
                    <Area type="monotone" dataKey="saldo" name="Saldo Projetado" stroke="hsl(var(--primary))" fill="url(#saldoGrad)" strokeWidth={2} />
                    <Line type="monotone" dataKey="entradas" name="Entradas" stroke="hsl(142, 71%, 45%)" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="saidas" name="Saídas" stroke="hsl(0, 70%, 50%)" strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* AI Analysis */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  <CardTitle className="text-sm">Análise Inteligente (IA)</CardTitle>
                </div>
                <Button size="sm" onClick={handleAIAnalysis} disabled={aiLoading} className="gap-1.5">
                  {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {aiLoading ? "Analisando..." : "Gerar Análise"}
                </Button>
              </div>
              <CardDescription className="text-xs">Diagnóstico, alertas e sugestões com inteligência artificial</CardDescription>
            </CardHeader>
            <CardContent>
              {aiAnalysis ? (
                <div className="prose prose-sm max-w-none dark:prose-invert text-sm whitespace-pre-wrap leading-relaxed">
                  {aiAnalysis}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Brain className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Clique em "Gerar Análise" para obter um diagnóstico financeiro completo com IA</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === ANÁLISE === */}
        <TabsContent value="analise" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Despesas por Categoria</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  {categoryData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Sem dados</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={categoryData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                          label={({ name, value }) => `${name}: ${formatCurrency(value)}`}>
                          {categoryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Composição dos Custos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 pt-2">
                  {[
                    { label: "Contas Fixas", value: contasFixas, color: "bg-primary" },
                    { label: "Salários", value: totalSalarios, color: "bg-blue-500" },
                    { label: "Comissões", value: totalComissoes, color: "bg-green-500" },
                  ].map(item => {
                    const pct = breakEven > 0 ? (item.value / breakEven) * 100 : 0;
                    return (
                      <div key={item.label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{item.label}</span>
                          <span className="font-medium tabular-nums">{formatCurrency(item.value)} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${item.color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <Separator className="my-3" />
                  <div className="flex justify-between font-bold text-sm">
                    <span>Total (Ponto de Equilíbrio)</span>
                    <span className="text-primary">{formatCurrency(breakEven)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Revenue vs Expenses */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Faturamento vs Custos</CardTitle>
              <CardDescription className="text-xs">Comparativo do mês atual</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { name: "Faturamento", valor: faturamento },
                    { name: "Custos Fixos", valor: contasFixas },
                    { name: "Folha", valor: totalFolha },
                    { name: "Ponto Equilíbrio", valor: breakEven },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                      {[0, 1, 2, 3].map(i => <Cell key={i} fill={CHART_COLORS[i]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" /> {editing ? "Editar Conta" : "Nova Conta a Pagar"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da Conta</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Aluguel da Loja" className="mt-1" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Detalhes adicionais" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor (R$)</Label>
                <Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} className="mt-1" />
              </div>
              <div>
                <Label>Vencimento</Label>
                <Input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Aluguel">Aluguel</SelectItem>
                  <SelectItem value="Fornecedor">Fornecedor</SelectItem>
                  <SelectItem value="Marketing">Marketing</SelectItem>
                  <SelectItem value="Serviços">Serviços</SelectItem>
                  <SelectItem value="Impostos">Impostos</SelectItem>
                  <SelectItem value="Outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Conta Fixa (recorrente)</Label>
                <p className="text-xs text-muted-foreground">Repete automaticamente todo mês</p>
              </div>
              <Switch checked={form.is_fixed} onCheckedChange={v => setForm(p => ({ ...p, is_fixed: v }))} />
            </div>
            {form.is_fixed && (
              <div>
                <Label>Recorrência</Label>
                <Select value={form.recurrence_type} onValueChange={v => setForm(p => ({ ...p, recurrence_type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="gap-1.5"><Save className="h-4 w-4" /> {editing ? "Salvar" : "Adicionar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
