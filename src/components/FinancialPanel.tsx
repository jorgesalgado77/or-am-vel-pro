import { useState, useCallback, lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/financing";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";
import { Wallet, Users, BarChart3, Brain, Receipt } from "lucide-react";
import { useFinancialData, type FinancialAccount } from "@/hooks/useFinancialData";
import { FinancialHeader } from "@/components/financial/FinancialHeader";
import { FinancialAccountsTab } from "@/components/financial/FinancialAccountsTab";
import { FinancialAccountDialog, type FinancialFormData } from "@/components/financial/FinancialAccountDialog";

// Lazy load chart-heavy tabs
const FinancialPayrollTab = lazy(() => import("@/components/financial/FinancialPayrollTab").then(m => ({ default: m.FinancialPayrollTab })));
const FinancialForecastTab = lazy(() => import("@/components/financial/FinancialForecastTab").then(m => ({ default: m.FinancialForecastTab })));
const FinancialAnalysisTab = lazy(() => import("@/components/financial/FinancialAnalysisTab").then(m => ({ default: m.FinancialAnalysisTab })));
const PayrollReport = lazy(() => import("@/components/PayrollReport").then(m => ({ default: m.PayrollReport })));

const TabLoader = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

export function FinancialPanel() {
  const fin = useFinancialData();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [form, setForm] = useState<FinancialFormData>({
    name: "", description: "", amount: "", due_date: format(new Date(), "yyyy-MM-dd"),
    status: "pendente", is_fixed: false, recurrence_type: "", category: "",
  });

  const resetForm = () => setForm({
    name: "", description: "", amount: "", due_date: format(new Date(), "yyyy-MM-dd"),
    status: "pendente", is_fixed: false, recurrence_type: "", category: "",
  });

  const startEdit = (acc: FinancialAccount) => {
    setForm({
      name: acc.name, description: acc.description || "", amount: maskCurrency(String(Math.round(acc.amount * 100))),
      due_date: acc.due_date, status: acc.status, is_fixed: acc.is_fixed,
      recurrence_type: acc.recurrence_type || "", category: acc.category || "",
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

  if (fin.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <FinancialHeader
        fin={fin}
        showNotifications={showNotifications}
        setShowNotifications={setShowNotifications}
        pdfLoading={pdfLoading}
        onExportPdf={handleExportPDF}
      />

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
          <TabsTrigger value="folha-completa" className="data-[state=active]:bg-green-500/10 data-[state=active]:text-green-600 data-[state=active]:shadow-sm gap-1.5">
            <Receipt className="h-4 w-4" /> Folha Completa
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contas" className="mt-4">
          <FinancialAccountsTab
            accounts={fin.accounts}
            search={search} setSearch={setSearch}
            filterStatus={filterStatus} setFilterStatus={setFilterStatus}
            onRefresh={fin.fetchData}
            onAdd={() => { resetForm(); setEditing(null); setShowAddDialog(true); }}
            onEdit={startEdit}
            onDelete={handleDelete}
            onMarkPaid={handleMarkPaid}
          />
        </TabsContent>

        <Suspense fallback={<TabLoader />}>
          <TabsContent value="folha" className="mt-4">
            <FinancialPayrollTab
              payrollFixed={fin.payrollFixed}
              commissions={fin.commissions}
              totalSalarios={fin.totalSalarios}
              totalComissoes={fin.totalComissoes}
              totalFolha={fin.totalFolha}
            />
          </TabsContent>

          <TabsContent value="previsao" className="mt-4">
            <FinancialForecastTab fin={fin} />
          </TabsContent>

          <TabsContent value="analise" className="mt-4">
            <FinancialAnalysisTab fin={fin} />
          </TabsContent>

          <TabsContent value="folha-completa" className="mt-4">
            <PayrollReport onBack={() => {}} />
          </TabsContent>
        </Suspense>
      </Tabs>

      <FinancialAccountDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        form={form}
        setForm={setForm}
        editing={!!editing}
        onSave={handleSave}
      />
    </div>
  );
}
