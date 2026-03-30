import { useEffect, useMemo, useState } from "react";
import { addDays, differenceInDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RefreshCw, Search, AlertTriangle, Clock, CheckCircle2, XCircle, CalendarClock } from "lucide-react";
import { getDealRoomProviderLabel } from "@/components/admin/dealroomApiCatalog";

interface DealRoomApiConfigRow {
  id: string;
  provider: string;
  nome: string;
  is_active: boolean;
}

interface DealRoomApiShareRow {
  id: string;
  config_id: string;
  tenant_id: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at: string;
}

interface TenantRow {
  id: string;
  nome_loja: string;
  codigo_loja: string | null;
}

interface Props {
  title?: string;
}

type StatusFilter = "todos" | "ativo" | "expirando" | "expirado" | "desativado" | "agendado";

export function AdminSharedApiUsageList({ title = "Lojas usando APIs compartilhadas" }: Props) {
  const [configs, setConfigs] = useState<DealRoomApiConfigRow[]>([]);
  const [shares, setShares] = useState<DealRoomApiShareRow[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaReady, setSchemaReady] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [providerFilter, setProviderFilter] = useState("todos");

  const fetchData = async () => {
    setLoading(true);
    const [configRes, shareRes, tenantRpcRes] = await Promise.all([
      (supabase as any).from("dealroom_api_configs").select("id, provider, nome, is_active").order("nome"),
      (supabase as any).from("dealroom_api_shares").select("id, config_id, tenant_id, starts_at, ends_at, is_active, created_at").order("created_at", { ascending: false }),
      (supabase as any).rpc("admin_list_all_tenants"),
    ]);
    const missingSchema = [configRes.error, shareRes.error].some((error: any) => error?.code === "42P01");
    setSchemaReady(!missingSchema);
    if (!missingSchema) {
      setConfigs((configRes.data || []) as DealRoomApiConfigRow[]);
      setShares((shareRes.data || []) as DealRoomApiShareRow[]);
    }
    if (tenantRpcRes.data) {
      setTenants((tenantRpcRes.data as any[]).map((t) => ({ id: t.id, nome_loja: t.nome_loja, codigo_loja: t.codigo_loja || null })));
    } else {
      const { data } = await supabase.from("tenants").select("id, nome_loja, codigo_loja").order("nome_loja");
      setTenants((data || []) as TenantRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("admin-shared-dealroom-apis")
      .on("postgres_changes", { event: "*", schema: "public", table: "dealroom_api_configs" }, fetchData)
      .on("postgres_changes", { event: "*", schema: "public", table: "dealroom_api_shares" }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const configMap = useMemo(() => Object.fromEntries(configs.map((c) => [c.id, c])), [configs]);
  const tenantMap = useMemo(() => Object.fromEntries(tenants.map((t) => [t.id, t])), [tenants]);

  const rows = useMemo(() => {
    const now = new Date();
    return shares.map((share) => {
      const config = configMap[share.config_id];
      const tenant = tenantMap[share.tenant_id];
      const startsAt = new Date(share.starts_at);
      const endsAt = new Date(share.ends_at);
      const daysLeft = differenceInDays(endsAt, now);
      const totalDays = Math.max(differenceInDays(endsAt, startsAt), 1);
      const elapsed = Math.max(differenceInDays(now, startsAt), 0);
      const progressPct = Math.min(Math.round((elapsed / totalDays) * 100), 100);

      let status: "Ativo" | "Agendado" | "Expirado" | "Desativado" | "Expirando" = "Ativo";
      let variant: "default" | "secondary" | "destructive" | "outline" = "default";
      let StatusIcon = CheckCircle2;

      if (!share.is_active || !config?.is_active) {
        status = "Desativado"; variant = "secondary"; StatusIcon = XCircle;
      } else if (now < startsAt) {
        status = "Agendado"; variant = "outline"; StatusIcon = CalendarClock;
      } else if (now > endsAt) {
        status = "Expirado"; variant = "destructive"; StatusIcon = XCircle;
      } else if (daysLeft <= 7) {
        status = "Expirando"; variant = "destructive"; StatusIcon = AlertTriangle;
      } else {
        StatusIcon = CheckCircle2;
      }

      return {
        ...share,
        provider: config?.provider || "",
        providerLabel: getDealRoomProviderLabel(config?.provider || ""),
        tenantName: tenant?.nome_loja || "Loja não encontrada",
        tenantCode: tenant?.codigo_loja || "—",
        status,
        variant,
        StatusIcon,
        daysLeft,
        progressPct,
      };
    });
  }, [shares, configMap, tenantMap]);

  // Unique providers for filter
  const uniqueProviders = useMemo(() => {
    const set = new Set(rows.map((r) => r.provider).filter(Boolean));
    return Array.from(set).map((p) => ({ value: p, label: getDealRoomProviderLabel(p) }));
  }, [rows]);

  // Apply filters
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        if (!r.tenantName.toLowerCase().includes(q) && !r.tenantCode.toLowerCase().includes(q) && !r.providerLabel.toLowerCase().includes(q)) return false;
      }
      if (statusFilter !== "todos") {
        const map: Record<StatusFilter, string> = { todos: "", ativo: "Ativo", expirando: "Expirando", expirado: "Expirado", desativado: "Desativado", agendado: "Agendado" };
        if (r.status !== map[statusFilter]) return false;
      }
      if (providerFilter !== "todos" && r.provider !== providerFilter) return false;
      return true;
    });
  }, [rows, search, statusFilter, providerFilter]);

  // Summary counts
  const counts = useMemo(() => ({
    total: rows.length,
    ativo: rows.filter((r) => r.status === "Ativo").length,
    expirando: rows.filter((r) => r.status === "Expirando").length,
    expirado: rows.filter((r) => r.status === "Expirado").length,
  }), [rows]);

  const renewShare = async (shareId: string) => {
    const row = shares.find((i) => i.id === shareId);
    if (!row) return;
    const baseDate = new Date(row.ends_at) > new Date() ? new Date(row.ends_at) : new Date();
    const { error } = await (supabase as any).from("dealroom_api_shares").update({ ends_at: addDays(baseDate, 30).toISOString(), is_active: true, updated_at: new Date().toISOString() }).eq("id", shareId);
    if (error) { toast.error("Erro ao renovar: " + error.message); return; }
    toast.success("Renovado por +30 dias."); fetchData();
  };

  const deactivateShare = async (shareId: string) => {
    const { error } = await (supabase as any).from("dealroom_api_shares").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", shareId);
    if (error) { toast.error("Erro ao desativar: " + error.message); return; }
    toast.success("Compartilhamento desativado."); fetchData();
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> {counts.ativo} ativos</span>
            <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-500" /> {counts.expirando} expirando</span>
            <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-destructive" /> {counts.expirado} expirados</span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-2 shrink-0">
          <RefreshCw className="h-3 w-3" /> Atualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!schemaReady ? (
          <p className="text-sm text-muted-foreground">Execute o SQL de APIs compartilhadas para habilitar esta listagem.</p>
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar loja ou API..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos status</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="expirando">Expirando</SelectItem>
                  <SelectItem value="expirado">Expirado</SelectItem>
                  <SelectItem value="agendado">Agendado</SelectItem>
                  <SelectItem value="desativado">Desativado</SelectItem>
                </SelectContent>
              </Select>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Provider" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos providers</SelectItem>
                  {uniqueProviders.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loja</TableHead>
                    <TableHead>API</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Progresso</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Carregando...</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum resultado encontrado.</TableCell></TableRow>
                  ) : filtered.map((row) => (
                    <TableRow key={row.id} className={row.status === "Expirando" ? "bg-amber-500/5" : row.status === "Expirado" ? "bg-destructive/5" : ""}>
                      <TableCell>
                        <p className="font-medium text-sm">{row.tenantName}</p>
                        <p className="text-xs text-muted-foreground">{row.tenantCode}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{row.providerLabel}</Badge>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs">{format(new Date(row.starts_at), "dd/MM/yy", { locale: ptBR })}</p>
                        <p className="text-xs text-muted-foreground">até {format(new Date(row.ends_at), "dd/MM/yy", { locale: ptBR })}</p>
                      </TableCell>
                      <TableCell className="min-w-[120px]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="space-y-1">
                              <Progress
                                value={row.progressPct}
                                className="h-2"
                              />
                              <p className="text-[10px] text-muted-foreground">
                                {row.daysLeft > 0 ? `${row.daysLeft}d restantes` : row.status === "Agendado" ? "Aguardando início" : "Expirado"}
                              </p>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>{row.progressPct}% do período consumido</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.variant} className="gap-1">
                          <row.StatusIcon className="h-3 w-3" />
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1.5">
                          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => renewShare(row.id)}>Renovar</Button>
                          <Button variant="ghost" size="sm" className="text-xs h-7 text-destructive hover:text-destructive" onClick={() => deactivateShare(row.id)}>Desativar</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {filtered.length > 0 && (
              <p className="text-xs text-muted-foreground text-right">{filtered.length} de {rows.length} compartilhamento(s)</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
