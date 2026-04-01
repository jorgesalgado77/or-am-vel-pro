import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ClipboardList, Search, RefreshCw, Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { logAudit, getAuditUserInfo } from "@/services/auditService";
import { useComissaoPolicy, calcularComissao } from "@/hooks/useComissaoPolicy";
import { format, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

interface LastSimInfo {
  valor_final: number;
  valor_com_desconto: number;
  created_at: string;
}

const STATUS_OPTIONS = [
  { value: "fechado", label: "Fechado" },
  { value: "medicao", label: "Medição" },
  { value: "liberacao", label: "Liberação" },
  { value: "entrega", label: "Entrega" },
  { value: "montagem", label: "Montagem" },
  { value: "assistencia", label: "Ass.Técnica" },
  { value: "finalizado", label: "Finalizado" },
];

const STATUS_COLORS: Record<string, string> = {
  fechado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  medicao: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  liberacao: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  entrega: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  montagem: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  assistencia: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  finalizado: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  em_negociacao: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
};

interface TrackingRow {
  id: string;
  contract_id: string;
  tracking_id: string | null;
  client_id: string;
  simulation_id: string | null;
  numero_contrato: string;
  nome_cliente: string;
  cpf_cnpj: string | null;
  quantidade_ambientes: number;
  valor_contrato: number;
  data_fechamento: string | null;
  projetista: string | null;
  vendedor: string | null;
  status: string;
  created_at: string;
}

interface ContractTrackingListProps {
  clients: Client[];
  lastSims: Record<string, LastSimInfo>;
}

export const ContractTrackingList = memo(function ContractTrackingList({ clients, lastSims }: ContractTrackingListProps) {
  const { policy: comissaoPolicy } = useComissaoPolicy();
  const [trackings, setTrackings] = useState<TrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterProjetista, setFilterProjetista] = useState("_all");
  const [periodFilter, setPeriodFilter] = useState("mes_atual");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    numero_contrato: "", nome_cliente: "", cpf_cnpj: "",
    quantidade_ambientes: 0, valor_contrato: 0, data_fechamento: "", projetista: "",
  });
  const [saving, setSaving] = useState(false);
  const [allSellers, setAllSellers] = useState<string[]>([]);

  const fetchSellers = useCallback(async () => {
    const tenantId = await getResolvedTenantId();
    let query = (supabase as any).from("usuarios").select("nome_completo, cargo_nome").eq("ativo", true);
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data } = await query;
    if (data) {
      const names = (data as any[]).map((u) => u.nome_completo as string).filter(Boolean).sort();
      setAllSellers(names);
    }
  }, []);

  const fetchTrackings = useCallback(async () => {
    setLoading(true);
    const tenantId = await getResolvedTenantId();

    let contractQuery = supabase.from("client_contracts").select("id, client_id, simulation_id, created_at").order("created_at", { ascending: false });
    let trackingQuery = supabase.from("client_tracking").select("id, contract_id, client_id, numero_contrato, nome_cliente, cpf_cnpj, quantidade_ambientes, valor_contrato, data_fechamento, projetista, status, created_at").order("created_at", { ascending: false });
    let transactionQuery = supabase.from("dealroom_transactions").select("client_id, simulation_id, numero_contrato, nome_cliente, nome_vendedor, valor_venda, created_at").order("created_at", { ascending: false });

    if (tenantId) {
      contractQuery = contractQuery.eq("tenant_id", tenantId);
      trackingQuery = trackingQuery.eq("tenant_id", tenantId);
      transactionQuery = transactionQuery.eq("tenant_id", tenantId);
    }

    const [contractsRes, trackingRes, transactionsRes] = await Promise.all([contractQuery, trackingQuery, transactionQuery]);

    if (contractsRes.error) {
      toast.error("Erro ao carregar contratos fechados");
      setTrackings([]);
      setLoading(false);
      return;
    }

    const latestContractByClient = new Map<string, { id: string; client_id: string; simulation_id: string | null; created_at: string }>();
    for (const contract of contractsRes.data || []) {
      if (contract.client_id && !latestContractByClient.has(contract.client_id)) {
        latestContractByClient.set(contract.client_id, contract);
      }
    }

    const latestTrackingByClient = new Map<string, { id: string; contract_id: string | null; client_id: string; numero_contrato: string; nome_cliente: string; cpf_cnpj: string | null; quantidade_ambientes: number | null; valor_contrato: number | null; data_fechamento: string | null; projetista: string | null; status: string; created_at: string }>();
    for (const tracking of trackingRes.data || []) {
      if (tracking.client_id && !latestTrackingByClient.has(tracking.client_id)) {
        latestTrackingByClient.set(tracking.client_id, tracking);
      }
    }

    const latestTransactionByClient = new Map<string, { client_id: string | null; simulation_id: string | null; numero_contrato: string | null; nome_cliente: string | null; nome_vendedor: string | null; valor_venda: number; created_at: string }>();
    const latestTransactionBySimulation = new Map<string, { client_id: string | null; simulation_id: string | null; numero_contrato: string | null; nome_cliente: string | null; nome_vendedor: string | null; valor_venda: number; created_at: string }>();
    for (const transaction of transactionsRes.data || []) {
      if (transaction.client_id && !latestTransactionByClient.has(transaction.client_id)) {
        latestTransactionByClient.set(transaction.client_id, transaction);
      }
      if (transaction.simulation_id && !latestTransactionBySimulation.has(transaction.simulation_id)) {
        latestTransactionBySimulation.set(transaction.simulation_id, transaction);
      }
    }

    const clientMap = new Map<string, Client>(clients.map((client) => [client.id, client]));
    const POST_CLOSE_STATUSES = new Set(["medicao", "liberacao", "entrega", "montagem", "assistencia", "finalizado"]);

    const rows: TrackingRow[] = Array.from(latestContractByClient.values())
      .map((contract) => {
        const client = clientMap.get(contract.client_id);
        const tracking = latestTrackingByClient.get(contract.client_id);
        const transaction = (contract.simulation_id ? latestTransactionBySimulation.get(contract.simulation_id) : undefined) || latestTransactionByClient.get(contract.client_id);
        const sim = lastSims[contract.client_id];

        const resolvedStatus = tracking?.status && POST_CLOSE_STATUSES.has(tracking.status) ? tracking.status : "fechado";
        const resolvedValor = sim?.valor_com_desconto || sim?.valor_final || Number(tracking?.valor_contrato) || Number(transaction?.valor_venda) || 0;

        return {
          id: contract.id,
          contract_id: contract.id,
          tracking_id: tracking?.id || null,
          client_id: contract.client_id,
          simulation_id: contract.simulation_id || null,
          numero_contrato: tracking?.numero_contrato || transaction?.numero_contrato || (client as Record<string, unknown>)?.numero_orcamento as string || "—",
          nome_cliente: tracking?.nome_cliente || client?.nome || transaction?.nome_cliente || "Cliente sem nome",
          cpf_cnpj: tracking?.cpf_cnpj || client?.cpf || null,
          quantidade_ambientes: tracking?.quantidade_ambientes || client?.quantidade_ambientes || 0,
          valor_contrato: resolvedValor,
          data_fechamento: tracking?.data_fechamento || transaction?.created_at || contract.created_at,
          projetista: tracking?.projetista || client?.vendedor || null,
          vendedor: transaction?.nome_vendedor || client?.vendedor || null,
          status: resolvedStatus,
          created_at: tracking?.created_at || transaction?.created_at || contract.created_at,
        };
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setTrackings(rows);
    setLoading(false);
  }, [clients, lastSims]);

  useEffect(() => { fetchTrackings(); fetchSellers(); }, [fetchTrackings, fetchSellers]);

  const handleStatusChange = useCallback(async (row: TrackingRow, newStatus: string) => {
    if (row.tracking_id) {
      const { error } = await (supabase as any).from("client_tracking").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", row.tracking_id);
      if (error) { toast.error("Erro ao atualizar status"); return; }
      toast.success("Status atualizado!");
      setTrackings((prev) => prev.map((t) => t.id === row.id ? { ...t, status: newStatus } : t));
      const userInfo = getAuditUserInfo();
      logAudit({ acao: "status_tracking_alterado", entidade: "tracking", entidade_id: row.tracking_id, detalhes: { novo_status: newStatus }, ...userInfo });
      return;
    }

    const tenantId = await getResolvedTenantId();
    const comissaoResult = calcularComissao(row.valor_contrato, 0, comissaoPolicy, null);
    const { data, error } = await (supabase as any).from("client_tracking").insert({
      contract_id: row.contract_id, client_id: row.client_id,
      numero_contrato: row.numero_contrato !== "—" ? row.numero_contrato : "",
      nome_cliente: row.nome_cliente, cpf_cnpj: row.cpf_cnpj,
      quantidade_ambientes: row.quantidade_ambientes, valor_contrato: row.valor_contrato,
      data_fechamento: row.data_fechamento, projetista: row.projetista,
      status: newStatus, comissao_percentual: comissaoResult.percentual,
      comissao_valor: Math.round((row.valor_contrato * comissaoResult.percentual / 100) * 100) / 100,
      comissao_status: "pendente",
      ...(tenantId ? { tenant_id: tenantId } : {}),
    }).select("id").single();

    if (error) { toast.error("Erro ao atualizar status"); return; }
    toast.success("Status atualizado!");
    setTrackings((prev) => prev.map((t) => t.id === row.id ? { ...t, status: newStatus, tracking_id: data?.id || null } : t));
    const userInfo = getAuditUserInfo();
    logAudit({ acao: "status_tracking_alterado", entidade: "tracking", entidade_id: data?.id, detalhes: { client_id: row.client_id, novo_status: newStatus }, ...userInfo });
  }, [comissaoPolicy]);

  const handleAdd = useCallback(async () => {
    if (!form.numero_contrato.trim() || !form.nome_cliente.trim()) {
      toast.error("Preencha número do contrato e nome do cliente"); return;
    }
    setSaving(true);
    const tenantId = await getResolvedTenantId();
    let clientQuery = supabase.from("clients").select("id").ilike("nome", `%${form.nome_cliente.trim()}%`).limit(1);
    if (tenantId) clientQuery = clientQuery.eq("tenant_id", tenantId);
    const { data: clientData } = await clientQuery.single();
    const comissaoResult = calcularComissao(form.valor_contrato, 0, comissaoPolicy, null);

    const { error } = await (supabase as any).from("client_tracking").insert({
      client_id: clientData?.id || "00000000-0000-0000-0000-000000000000",
      numero_contrato: form.numero_contrato.trim(), nome_cliente: form.nome_cliente.trim(),
      cpf_cnpj: form.cpf_cnpj.trim() || null, quantidade_ambientes: form.quantidade_ambientes,
      valor_contrato: form.valor_contrato, data_fechamento: form.data_fechamento || null,
      projetista: form.projetista.trim() || null, status: "medicao",
      comissao_percentual: comissaoResult.percentual,
      comissao_valor: Math.round((form.valor_contrato * comissaoResult.percentual / 100) * 100) / 100,
      comissao_status: "pendente",
      ...(tenantId ? { tenant_id: tenantId } : {}),
    });
    setSaving(false);
    if (error) toast.error("Erro ao adicionar");
    else {
      toast.success("Contrato adicionado!");
      setShowAdd(false);
      setForm({ numero_contrato: "", nome_cliente: "", cpf_cnpj: "", quantidade_ambientes: 0, valor_contrato: 0, data_fechamento: "", projetista: "" });
      fetchTrackings();
    }
  }, [comissaoPolicy, form, fetchTrackings]);

  const uniqueProjetistas = useMemo(() => {
    const set = new Set<string>(allSellers);
    trackings.forEach((t) => { const p = t.projetista || t.vendedor; if (p) set.add(p); });
    return Array.from(set).sort();
  }, [trackings, allSellers]);

  const filtered = useMemo(() => {
    const now = new Date();
    let pStart: Date | null = null;
    let pEnd: Date | null = null;
    switch (periodFilter) {
      case "mes_atual": pStart = startOfMonth(now); pEnd = endOfDay(now); break;
      case "mes_anterior": { const prev = subMonths(now, 1); pStart = startOfMonth(prev); pEnd = endOfMonth(prev); break; }
      case "3meses": pStart = startOfDay(subMonths(now, 3)); pEnd = endOfDay(now); break;
      case "6meses": pStart = startOfDay(subMonths(now, 6)); pEnd = endOfDay(now); break;
      case "ano_anterior": { const y = now.getFullYear() - 1; pStart = new Date(y, 0, 1); pEnd = new Date(y, 11, 31, 23, 59, 59); break; }
      case "personalizado":
        if (customStart) pStart = startOfDay(new Date(customStart));
        if (customEnd) pEnd = endOfDay(new Date(customEnd));
        break;
    }
    return trackings.filter((t) => {
      const matchSearch = t.numero_contrato.toLowerCase().includes(search.toLowerCase()) ||
        t.nome_cliente.toLowerCase().includes(search.toLowerCase()) ||
        (t.projetista || "").toLowerCase().includes(search.toLowerCase());
      const matchProjetista = filterProjetista === "_all" || (t.projetista || t.vendedor) === filterProjetista;
      let matchPeriod = true;
      if (pStart || pEnd) {
        const d = t.data_fechamento ? new Date(t.data_fechamento) : null;
        if (!d) matchPeriod = false;
        else {
          if (pStart && d < pStart) matchPeriod = false;
          if (pEnd && d > pEnd) matchPeriod = false;
        }
      }
      return matchSearch && matchProjetista && matchPeriod;
    });
  }, [trackings, search, filterProjetista, periodFilter, customStart, customEnd]);

  const getStatusLabel = useCallback((val: string) => STATUS_OPTIONS.find((s) => s.value === val)?.label || val, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Contratos Fechados — Acompanhamento
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchTrackings} className="gap-1"><RefreshCw className="h-3 w-3" />Atualizar</Button>
            <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1"><Plus className="h-3 w-3" />Novo</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-3 items-end">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar contrato, cliente ou projetista..." className="pl-9" />
          </div>
          <div className="min-w-[180px]">
            <Select value={filterProjetista} onValueChange={setFilterProjetista}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Projetista" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos os projetistas</SelectItem>
                {uniqueProjetistas.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[180px]">
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mes_atual">Mês Atual</SelectItem>
                <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
                <SelectItem value="3meses">Últimos 3 Meses</SelectItem>
                <SelectItem value="6meses">Últimos 6 Meses</SelectItem>
                <SelectItem value="ano_anterior">Ano Anterior</SelectItem>
                <SelectItem value="personalizado">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {periodFilter === "personalizado" && (
            <div className="flex gap-2 items-center">
              <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="h-9 text-sm w-36" />
              <span className="text-xs text-muted-foreground">até</span>
              <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="h-9 text-sm w-36" />
            </div>
          )}
        </div>
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">Status</TableHead>
                <TableHead>Nº Contrato</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-center">Ambientes</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Fechamento</TableHead>
                <TableHead>Projetista</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum contrato fechado</TableCell></TableRow>
              ) : (
                filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Select value={t.status} onValueChange={(val) => handleStatusChange(t, val)}>
                        <SelectTrigger className="h-8 text-xs w-[130px]">
                          <Badge className={`${STATUS_COLORS[t.status] || ""} text-xs font-medium border-0`}>{getStatusLabel(t.status)}</Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{t.numero_contrato}</TableCell>
                    <TableCell>{t.nome_cliente}</TableCell>
                    <TableCell className="text-center">{t.quantidade_ambientes}</TableCell>
                    <TableCell className="text-right">{Number(t.valor_contrato).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                    <TableCell>{t.data_fechamento ? format(new Date(t.data_fechamento), "dd/MM/yyyy") : "—"}</TableCell>
                    <TableCell>{t.projetista || t.vendedor || "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Contrato Fechado</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Nº Contrato *</Label><Input value={form.numero_contrato} onChange={(e) => setForm({ ...form, numero_contrato: e.target.value })} className="mt-1" /></div>
              <div><Label>CPF/CNPJ</Label><Input value={form.cpf_cnpj} onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })} className="mt-1" /></div>
            </div>
            <div><Label>Nome do Cliente *</Label><Input value={form.nome_cliente} onChange={(e) => setForm({ ...form, nome_cliente: e.target.value })} className="mt-1" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><Label>Ambientes</Label><Input type="number" value={form.quantidade_ambientes} onChange={(e) => setForm({ ...form, quantidade_ambientes: Number(e.target.value) })} className="mt-1" /></div>
              <div><Label>Valor do Contrato</Label><Input type="number" value={form.valor_contrato} onChange={(e) => setForm({ ...form, valor_contrato: Number(e.target.value) })} className="mt-1" /></div>
              <div><Label>Data Fechamento</Label><Input type="date" value={form.data_fechamento} onChange={(e) => setForm({ ...form, data_fechamento: e.target.value })} className="mt-1" /></div>
            </div>
            <div><Label>Projetista</Label><Input value={form.projetista} onChange={(e) => setForm({ ...form, projetista: e.target.value })} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? "Salvando..." : "Adicionar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
});
