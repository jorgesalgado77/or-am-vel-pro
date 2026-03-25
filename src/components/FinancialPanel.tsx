import { useState, useCallback } from "react";
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
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/financing";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, Plus, Trash2,
  Save, Pencil, Search, RefreshCw, Receipt, Users, Target,
  ArrowUpRight, ArrowDownRight, CalendarDays, Bell, CheckCircle2,
  Brain, Sparkles, Loader2, FileDown, Wallet, BarChart3
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Line, Area, AreaChart, ReferenceLine, Legend
} from "recharts";
import {
  useFinancialData, STATUS_MAP, CHART_COLORS,
  type FinancialAccount,
} from "@/hooks/useFinancialData";

export function FinancialPanel() {
  const fin = useFinancialData();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [form, setForm] = useState({
    name: "", description: "", amount: "", due_date: format(new Date(), "yyyy-MM-dd"),
    status: "pendente" as "pendente" | "pago" | "atrasado", is_fixed: false, recurrence_type: "", category: ""
  });

  const resetForm = () => setForm({
    name: "", description: "", amount: "", due_date: format(new Date(), "yyyy-MM-dd"),
    status: "pendente", is_fixed: false, recurrence_type: "", category: ""
  });

  const startEdit = (acc: FinancialAccount) => {
    setForm({
      name: acc.name, description: acc.description || "", amount: maskCurrency(String(Math.round(acc.amount * 100))),
      due_date: acc.due_date, status: acc.status, is_fixed: acc.is_fixed,
      recurrence_type: acc.recurrence_type || "", category: acc.category || ""
    });
    setEditing(acc.id);
    setShowAddDialog(true);
  };

  const handleSave = async () => {
    const amountNum = unmaskCurrency(form.amount);
    if (!form.name.trim() || amountNum <= 0) { toast.error("Nome e valor são obrigatórios"); return; }
    const payload = {
      tenant_id: fin.tenantId, name: form.name.trim(), description: form.description || null,
      amount: amountNum, due_date: form.due_date, status: form.status,
      is_fixed: form.is_fixed, recurrence_type: form.recurrence_type || null, category: form.category || null,
    };
    if (editing) {
      const { error } = await supabase.from("financial_accounts" as any).update(payload as any).eq("id", editing);
      if (error) toast.error("Erro ao atualizar"); else { toast.success("Conta atualizada!"); setEditing(null); }
    } else {
      const { error } = await supabase.from("financial_accounts" as any).insert(payload as any);
      if (error) toast.error("Erro ao criar conta"); else toast.success("Conta adicionada!");
    }
    resetForm(); setShowAddDialog(false); fin.fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta conta?")) return;
    await supabase.from("financial_accounts" as any).delete().eq("id", id);
    toast.success("Conta excluída"); fin.fetchData();
  };

  const handleMarkPaid = async (id: string) => {
    await supabase.from("financial_accounts" as any).update({ status: "pago" } as any).eq("id", id);
    toast.success("Conta marcada como paga!"); fin.fetchData();
  };

  const handleAIAnalysis = useCallback(async () => {
    setAiLoading(true);
    try {
      const resumo = `Faturamento: ${formatCurrency(fin.faturamento)}\nCustos fixos: ${formatCurrency(fin.contasFixas)}\nFolha: ${formatCurrency(fin.totalFolha)}\nPonto equilíbrio: ${formatCurrency(fin.breakEven)}\nResultado: ${formatCurrency(fin.lucroEstimado)}\nVencidas: ${fin.contasVencidas.length}\nA vencer 7d: ${fin.contasAVencer7d.length}\nSaldo 30d: ${formatCurrency(fin.saldoFinal30d)}\nDias negativo: ${fin.diasNegativo}`;
      const { data, error } = await supabase.functions.invoke("cashflow-ai", { body: { resumo_financeiro: resumo } });
      if (error) throw error;
      setAiAnalysis(data.analise || "Sem análise disponível.");
    } catch { toast.error("Erro ao gerar análise de IA"); } finally { setAiLoading(false); }
  }, [fin]);

  const handleExportPDF = useCallback(async () => {
    setPdfLoading(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      const mesRefLabel = format(new Date(), "MMMM yyyy", { locale: ptBR });
      doc.setFontSize(18); doc.text("Relatório Financeiro Mensal", 14, 22);
      doc.setFontSize(10); doc.setTextColor(100);
      doc.text(`Período: ${mesRefLabel}`, 14, 30);
      doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 36);
      doc.setFontSize(13); doc.setTextColor(0); doc.text("Resumo Financeiro", 14, 48);
      doc.setFontSize(10);
      const kpis = [
        `Faturamento: ${formatCurrency(fin.faturamento)}`, `Total a Pagar: ${formatCurrency(fin.totalContasPagar)}`,
        `Contas Vencidas: ${fin.contasVencidas.length}`, `Custos Fixos: ${formatCurrency(fin.contasFixas)}`,
        `Folha Total: ${formatCurrency(fin.totalFolha)}`, `Ponto de Equilíbrio: ${formatCurrency(fin.breakEven)}`,
        `Resultado: ${formatCurrency(fin.lucroEstimado)} (${fin.lucroEstimado >= 0 ? "LUCRO" : "PREJUÍZO"})`,
        `Saldo Projetado 30d: ${formatCurrency(fin.saldoFinal30d)}`,
      ];
      kpis.forEach((line, i) => doc.text(line, 14, 56 + i * 7));
      let y = 56 + kpis.length * 7 + 10;
      doc.setFontSize(13); doc.text("Contas a Pagar", 14, y); y += 8;
      doc.setFontSize(9); doc.setTextColor(80);
      doc.text("Conta", 14, y); doc.text("Valor", 90, y); doc.text("Vencimento", 130, y); doc.text("Status", 170, y);
      y += 6; doc.setTextColor(0);
      fin.accounts.slice(0, 25).forEach(acc => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(acc.name.slice(0, 30), 14, y); doc.text(formatCurrency(acc.amount), 90, y);
        doc.text(format(new Date(acc.due_date), "dd/MM/yyyy"), 130, y); doc.text(acc.status, 170, y); y += 6;
      });
      if (fin.payrollFixed.length > 0) {
        y += 8; if (y > 250) { doc.addPage(); y = 20; }
        doc.setFontSize(13); doc.text("Folha de Pagamento", 14, y); y += 8; doc.setFontSize(9);
        fin.payrollFixed.forEach(pf => {
          if (y > 270) { doc.addPage(); y = 20; }
          const comm = fin.commissions.find(c => c.usuario_id === pf.usuario_id);
          doc.text(`${pf.usuario_nome} - Sal: ${formatCurrency(pf.salary)} | Com: ${formatCurrency(comm?.total_comissao || 0)} | Total: ${formatCurrency(pf.salary + (comm?.total_comissao || 0))}`, 14, y);
          y += 6;
        });
      }
      doc.save(`relatorio-financeiro-${format(new Date(), "yyyy-MM")}.pdf`);
      toast.success("Relatório PDF gerado com sucesso!");
    } catch { toast.error("Erro ao gerar PDF"); } finally { setPdfLoading(false); }
  }, [fin]);

  const filtered = fin.accounts.filter(a => {
    if (filterStatus !== "todos" && a.status !== filterStatus) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (fin.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Action bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold">Módulo Financeiro</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowNotifications(!showNotifications)}>
              <Bell className="h-3.5 w-3.5" /> Alertas
              {fin.notifications.filter(n => !n.read).length > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center">
                  {fin.notifications.filter(n => !n.read).length}
                </span>
              )}
            </Button>
            {showNotifications && (
              <div className="absolute right-0 top-full mt-1 w-80 bg-card border rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                <div className="p-3 border-b font-semibold text-sm">Notificações Financeiras</div>
                {fin.notifications.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">Nenhum alerta no momento ✅</div>
                ) : fin.notifications.map(n => (
                  <div key={n.id} className={`p-3 border-b text-sm ${n.type === "atrasado" ? "bg-destructive/5" : "bg-accent/30"}`}>
                    {n.message}
                  </div>
                ))}
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportPDF} disabled={pdfLoading}>
            {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-lg font-bold">{formatCurrency(fin.totalContasPagar)}</p>
              <p className="text-xs text-muted-foreground">Total a Pagar</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-lg font-bold text-destructive">{fin.contasVencidas.length}</p>
              <p className="text-xs text-muted-foreground">Contas Vencidas</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold">{fin.contasAVencer7d.length}</p>
              <p className="text-xs text-muted-foreground">Vencem em 7 dias</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${fin.lucroEstimado >= 0 ? "bg-primary/10" : "bg-destructive/10"}`}>
              {fin.lucroEstimado >= 0 ? <TrendingUp className="h-5 w-5 text-primary" /> : <TrendingDown className="h-5 w-5 text-destructive" />}
            </div>
            <div>
              <p className={`text-lg font-bold ${fin.lucroEstimado >= 0 ? "text-primary" : "text-destructive"}`}>
                {formatCurrency(Math.abs(fin.lucroEstimado))}
              </p>
              <p className="text-xs text-muted-foreground">{fin.lucroEstimado >= 0 ? "Lucro Estimado" : "Prejuízo Estimado"}</p>
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
              <p className="font-bold text-sm">{formatCurrency(fin.contasFixas)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Folha Total</p>
              <p className="font-bold text-sm">{formatCurrency(fin.totalFolha)}</p>
            </div>
            <div className="text-center">
              <Target className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-xs text-muted-foreground mb-1">Ponto de Equilíbrio</p>
              <p className="font-bold text-primary">{formatCurrency(fin.breakEven)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Faturamento Atual</p>
              <p className="font-bold text-sm">{formatCurrency(fin.faturamento)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Resultado</p>
              <p className={`font-bold text-sm ${fin.lucroEstimado >= 0 ? "text-primary" : "text-destructive"}`}>
                {fin.lucroEstimado >= 0 ? "+" : ""}{formatCurrency(fin.lucroEstimado)}
              </p>
              {fin.faturamento > 0 && (
                <div className="mt-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${fin.lucroEstimado >= 0 ? "bg-primary" : "bg-destructive"}`}
                    style={{ width: `${Math.min((fin.faturamento / (fin.breakEven || 1)) * 100, 100)}%` }} />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="contas">
        <TabsList className="flex-wrap gap-1 bg-muted/50 p-1">
          <TabsTrigger value="contas" className="data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive data-[state=active]:shadow-sm gap-1.5">
            <Wallet className="h-4 w-4" /> Contas a Pagar
          </TabsTrigger>
          <TabsTrigger value="folha" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm gap-1.5">
            <Users className="h-4 w-4" /> Folha de Pagamento
          </TabsTrigger>
          <TabsTrigger value="previsao" className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-sm gap-1.5">
            <BarChart3 className="h-4 w-4" /> Previsão de Caixa
          </TabsTrigger>
          <TabsTrigger value="analise" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm gap-1.5">
            <Brain className="h-4 w-4" /> Análise
          </TabsTrigger>
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
            <Button variant="outline" size="sm" onClick={fin.fetchData} className="gap-1.5">
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
                        <TableCell className="text-sm tabular-nums">{format(new Date(acc.due_date), "dd/MM/yyyy")}</TableCell>
                        <TableCell><Badge variant="outline" className={st.color}>{st.label}</Badge></TableCell>
                        <TableCell>
                          {acc.is_fixed ? (
                            <Badge variant="secondary" className="text-[10px]">Fixo • {acc.recurrence_type || "mensal"}</Badge>
                          ) : <span className="text-xs text-muted-foreground">Variável</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {acc.status !== "pago" && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => handleMarkPaid(acc.id)} title="Marcar como pago">
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
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-bold">{formatCurrency(fin.totalSalarios)}</p>
                  <p className="text-xs text-muted-foreground">Salários Fixos</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-bold">{formatCurrency(fin.totalComissoes)}</p>
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
                  <p className="text-lg font-bold">{formatCurrency(fin.totalFolha)}</p>
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
                  {fin.payrollFixed.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        Nenhum salário fixo cadastrado. Use Configurações para adicionar.
                      </TableCell>
                    </TableRow>
                  ) : fin.payrollFixed.map(pf => {
                    const comm = fin.commissions.find(c => c.usuario_id === pf.usuario_id);
                    const commVal = comm?.total_comissao || 0;
                    return (
                      <TableRow key={pf.id}>
                        <TableCell className="font-medium">{pf.usuario_nome}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px]">{pf.type}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(pf.salary)}</TableCell>
                        <TableCell className="text-right tabular-nums text-primary">{formatCurrency(commVal)}</TableCell>
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${fin.saldoFinal30d >= 0 ? "bg-primary/10" : "bg-destructive/10"}`}>
                  {fin.saldoFinal30d >= 0 ? <TrendingUp className="h-5 w-5 text-primary" /> : <TrendingDown className="h-5 w-5 text-destructive" />}
                </div>
                <div>
                  <p className={`text-lg font-bold ${fin.saldoFinal30d >= 0 ? "text-primary" : "text-destructive"}`}>{formatCurrency(fin.saldoFinal30d)}</p>
                  <p className="text-xs text-muted-foreground">Saldo em 30 dias</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${fin.diasNegativo > 0 ? "bg-destructive/10" : "bg-primary/10"}`}>
                  <AlertTriangle className={`h-5 w-5 ${fin.diasNegativo > 0 ? "text-destructive" : "text-primary"}`} />
                </div>
                <div>
                  <p className={`text-lg font-bold ${fin.diasNegativo > 0 ? "text-destructive" : "text-primary"}`}>{fin.diasNegativo}</p>
                  <p className="text-xs text-muted-foreground">Dias no Vermelho</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <ArrowUpRight className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-bold">{formatCurrency(fin.faturamento / 30)}</p>
                  <p className="text-xs text-muted-foreground">Entrada Diária Média</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
                  <ArrowDownRight className="h-5 w-5 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-lg font-bold">{formatCurrency((fin.contasFixas + fin.totalFolha) / 30)}</p>
                  <p className="text-xs text-muted-foreground">Saída Diária Média</p>
                </div>
              </div>
            </Card>
          </div>

          {fin.diasNegativo > 0 && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="p-4 flex items-center gap-3">
                <Bell className="h-5 w-5 text-destructive animate-pulse" />
                <div>
                  <p className="font-semibold text-destructive text-sm">⚠️ Alerta de Caixa Negativo</p>
                  <p className="text-xs text-muted-foreground">Seu saldo ficará negativo em {fin.diasNegativo} dos próximos 30 dias.</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Previsão de Saldo — Próximos 30 Dias</CardTitle>
              <CardDescription className="text-xs">Baseado em receitas e despesas projetadas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={fin.forecastData}>
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
                    <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="3 3" label="Zero" />
                    <Area type="monotone" dataKey="saldo" name="Saldo Projetado" stroke="hsl(var(--primary))" fill="url(#saldoGrad)" strokeWidth={2} />
                    <Line type="monotone" dataKey="entradas" name="Entradas" stroke="hsl(var(--chart-2))" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="saidas" name="Saídas" stroke="hsl(var(--destructive))" strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

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
                <div className="prose prose-sm max-w-none dark:prose-invert text-sm whitespace-pre-wrap leading-relaxed">{aiAnalysis}</div>
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
              <CardHeader className="pb-2"><CardTitle className="text-sm">Despesas por Categoria</CardTitle></CardHeader>
              <CardContent>
                <div className="h-56">
                  {fin.categoryData.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Sem dados</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={fin.categoryData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                          label={({ name, value }) => `${name}: ${formatCurrency(value)}`}>
                          {fin.categoryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Composição dos Custos</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3 pt-2">
                  {[
                    { label: "Contas Fixas", value: fin.contasFixas, color: "bg-primary" },
                    { label: "Salários", value: fin.totalSalarios, color: "bg-chart-2" },
                    { label: "Comissões", value: fin.totalComissoes, color: "bg-chart-3" },
                  ].map(item => {
                    const pct = fin.breakEven > 0 ? (item.value / fin.breakEven) * 100 : 0;
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
                    <span className="text-primary">{formatCurrency(fin.breakEven)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Faturamento vs Custos</CardTitle>
              <CardDescription className="text-xs">Comparativo do mês atual</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { name: "Faturamento", valor: fin.faturamento },
                    { name: "Custos Fixos", valor: fin.contasFixas },
                    { name: "Folha", valor: fin.totalFolha },
                    { name: "Ponto Equilíbrio", valor: fin.breakEven },
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
                <Input value={form.amount} onChange={e => setForm(p => ({ ...p, amount: maskCurrency(e.target.value) }))} className="mt-1" placeholder="R$ 0,00" />
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
