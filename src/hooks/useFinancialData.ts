/**
 * Hook for financial panel data fetching and state management.
 * Extracted from FinancialPanel.tsx to reduce its complexity.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { formatCurrency } from "@/lib/financing";
import { format, addDays, isPast, isAfter, isBefore, eachDayOfInterval } from "date-fns";
import { toast } from "sonner";

export interface FinancialAccount {
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

export interface PayrollFixed {
  id: string;
  usuario_id: string;
  usuario_nome: string;
  salary: number;
  type: string;
}

export interface PayrollCommission {
  usuario_id: string;
  usuario_nome: string;
  total_comissao: number;
  total_vendas: number;
}

export interface FinancialNotification {
  id: string;
  message: string;
  type: string;
  read: boolean;
}

export const STATUS_MAP = {
  pendente: { label: "Pendente", color: "bg-amber-500/10 text-amber-700 border-amber-200" },
  pago: { label: "Pago", color: "bg-green-500/10 text-green-700 border-green-200" },
  atrasado: { label: "Atrasado", color: "bg-red-500/10 text-red-700 border-red-200" },
};

export const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

export function useFinancialData() {
  const tenantId = getTenantId();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [payrollFixed, setPayrollFixed] = useState<PayrollFixed[]>([]);
  const [commissions, setCommissions] = useState<PayrollCommission[]>([]);
  const [faturamento, setFaturamento] = useState(0);
  const [notifications, setNotifications] = useState<FinancialNotification[]>([]);
  const [forecastCache, setForecastCache] = useState<{ data: any[]; timestamp: number } | null>(null);

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);

    const { data: accs } = await supabase
      .from("financial_accounts" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("due_date", { ascending: true });
    if (accs) {
      const updated = (accs as any[]).map(a => ({
        ...a,
        status: a.status === "pendente" && isPast(new Date(a.due_date)) ? "atrasado" : a.status
      }));
      setAccounts(updated as FinancialAccount[]);
    }

    // Buscar salários da tabela usuarios (mesma fonte que PayrollReport)
    const { data: usersData } = await supabase
      .from("usuarios")
      .select("id, nome_completo, salario_fixo, tipo_regime, cargo_id, ativo, cargos(nome, salario_base)")
      .eq("tenant_id", tenantId)
      .eq("ativo", true);
    if (usersData) {
      setPayrollFixed((usersData as any[]).map(u => ({
        id: u.id, usuario_id: u.id,
        usuario_nome: u.nome_completo || "—",
        salary: u.salario_fixo || (u.cargos as any)?.salario_base || 0,
        type: u.tipo_regime || "—"
      })));
    }

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

    const { data: sims } = await supabase
      .from("simulations" as any)
      .select("valor_final")
      .eq("tenant_id", tenantId)
      .gte("created_at", `${mesRef}-01`);
    if (sims) {
      setFaturamento((sims as any[]).reduce((sum, s) => sum + (s.valor_final || 0), 0));
    }

    // Notifications
    const alertsList: FinancialNotification[] = [];
    const now = new Date();
    const limit7d = addDays(now, 7);
    (accs as any[] || []).forEach((a: any) => {
      if (a.status === "pago") return;
      const due = new Date(a.due_date);
      if (isPast(due) && a.status !== "pago") {
        alertsList.push({ id: `atrasado-${a.id}`, message: `⚠️ "${a.name}" venceu em ${format(due, "dd/MM/yyyy")} — ${formatCurrency(a.amount)}`, type: "atrasado", read: false });
      } else if (isAfter(due, now) && isBefore(due, limit7d)) {
        alertsList.push({ id: `vencer-${a.id}`, message: `🔔 "${a.name}" vence em ${format(due, "dd/MM/yyyy")} — ${formatCurrency(a.amount)}`, type: "vencer", read: false });
      }
    });
    setNotifications(alertsList);
    if (alertsList.filter(a => a.type === "atrasado").length > 0) {
      toast.warning(`Você tem ${alertsList.filter(a => a.type === "atrasado").length} conta(s) vencida(s)!`, { duration: 6000 });
    }
    if (alertsList.length > 0 && tenantId) {
      alertsList.forEach(async (alert) => {
        await supabase.from("financial_notifications" as any).upsert({
          id: alert.id, tenant_id: tenantId, message: alert.message, type: alert.type, read: false,
        } as any, { onConflict: "id" }).then(() => {});
      });
    }

    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Computed values
  const totalContasPagar = useMemo(() =>
    accounts.filter(a => a.status !== "pago").reduce((sum, a) => sum + a.amount, 0), [accounts]);
  const contasVencidas = useMemo(() => accounts.filter(a => a.status === "atrasado"), [accounts]);
  const contasAVencer7d = useMemo(() =>
    accounts.filter(a => {
      if (a.status === "pago") return false;
      const due = new Date(a.due_date);
      return isAfter(due, new Date()) && isBefore(due, addDays(new Date(), 7));
    }), [accounts]);
  const contasFixas = useMemo(() =>
    accounts.filter(a => a.is_fixed).reduce((sum, a) => sum + a.amount, 0), [accounts]);
  const totalSalarios = useMemo(() => payrollFixed.reduce((sum, p) => sum + p.salary, 0), [payrollFixed]);
  const totalComissoes = useMemo(() => commissions.reduce((sum, c) => sum + c.total_comissao, 0), [commissions]);
  const totalFolha = totalSalarios + totalComissoes;
  const breakEven = contasFixas + totalFolha;
  const lucroEstimado = faturamento - breakEven;

  const categoryData = useMemo(() => {
    const cats: Record<string, number> = {};
    accounts.forEach(a => { const cat = a.category || "Outros"; cats[cat] = (cats[cat] || 0) + a.amount; });
    return Object.entries(cats).map(([name, value]) => ({ name, value }));
  }, [accounts]);

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
      return { dia: format(day, "dd/MM"), entradas: Math.round(dailyRevenue), saidas: Math.round(dayCost), saldo: Math.round(saldoAcumulado) };
    });
    setForecastCache({ data, timestamp: Date.now() });
    return data;
  }, [accounts, faturamento, contasFixas, totalFolha, totalContasPagar]);

  const saldoFinal30d = forecastData.length > 0 ? forecastData[forecastData.length - 1].saldo : 0;
  const diasNegativo = forecastData.filter(d => d.saldo < 0).length;

  return {
    tenantId, accounts, loading, payrollFixed, commissions, faturamento,
    notifications, fetchData,
    totalContasPagar, contasVencidas, contasAVencer7d, contasFixas,
    totalSalarios, totalComissoes, totalFolha, breakEven, lucroEstimado,
    categoryData, forecastData, saldoFinal30d, diasNegativo,
  };
}
