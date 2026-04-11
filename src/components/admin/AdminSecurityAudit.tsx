import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, ShieldAlert, Search } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AuditRow {
  id: string;
  acao: string;
  entidade: string;
  usuario_id: string | null;
  usuario_nome: string | null;
  tenant_id: string | null;
  detalhes: Record<string, any> | null;
  created_at: string;
}

interface TenantMap {
  [id: string]: { codigo_loja: string; nome_empresa: string };
}

export function AdminSecurityAudit() {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantMap, setTenantMap] = useState<TenantMap>({});
  const [searchEmail, setSearchEmail] = useState("");
  const [filterMotivo, setFilterMotivo] = useState<string>("all");
  const [limit, setLimit] = useState(100);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [logsRes, tenantsRes, companyRes] = await Promise.all([
      (supabase as any)
        .from("audit_logs")
        .select("*")
        .eq("entidade", "security")
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase.from("tenants").select("id, codigo_loja"),
      (supabase as any).from("company_settings").select("tenant_id, codigo_loja, nome_empresa"),
    ]);

    if (logsRes.data) setLogs(logsRes.data);

    const map: TenantMap = {};
    (tenantsRes.data ?? []).forEach((t: any) => {
      map[t.id] = { codigo_loja: t.codigo_loja || "", nome_empresa: "" };
    });
    (companyRes.data ?? []).forEach((c: any) => {
      if (map[c.tenant_id]) {
        map[c.tenant_id].nome_empresa = c.nome_empresa || "";
        if (!map[c.tenant_id].codigo_loja) map[c.tenant_id].codigo_loja = c.codigo_loja || "";
      } else {
        map[c.tenant_id] = { codigo_loja: c.codigo_loja || "", nome_empresa: c.nome_empresa || "" };
      }
    });
    setTenantMap(map);
    setLoading(false);
  }, [limit]);

  useEffect(() => { loadData(); }, [loadData]);

  const motivos = Array.from(new Set(
    logs.map(l => l.detalhes?.tipo as string).filter(Boolean)
  )).sort();

  const filtered = logs.filter(l => {
    const email = (l.detalhes?.email as string || "").toLowerCase();
    if (searchEmail && !email.includes(searchEmail.toLowerCase())) return false;
    if (filterMotivo !== "all" && l.detalhes?.tipo !== filterMotivo) return false;
    return true;
  });

  const getMotivoColor = (tipo: string | undefined) => {
    if (!tipo) return "secondary";
    if (tipo.includes("bloqueado")) return "destructive";
    if (tipo.includes("sucesso")) return "default";
    return "secondary";
  };

  const getTenantLabel = (tenantId: string | null) => {
    if (!tenantId) return "—";
    const t = tenantMap[tenantId];
    if (!t) return tenantId.slice(0, 8) + "…";
    return t.codigo_loja ? `${t.codigo_loja} — ${t.nome_empresa || "Sem nome"}` : t.nome_empresa || tenantId.slice(0, 8);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Auditoria de Segurança — Tentativas Bloqueadas
          </CardTitle>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filtrar por email..."
              value={searchEmail}
              onChange={e => setSearchEmail(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Select value={filterMotivo} onValueChange={setFilterMotivo}>
            <SelectTrigger className="w-[220px] h-9">
              <SelectValue placeholder="Tipo de evento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {motivos.map(m => (
                <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(limit)} onValueChange={v => setLimit(Number(v))}>
            <SelectTrigger className="w-[100px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="250">250</SelectItem>
              <SelectItem value="500">500</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-auto max-h-[600px]">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="text-xs w-[150px]">Data / Hora</TableHead>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Cód. Loja Digitado</TableHead>
                <TableHead className="text-xs">Loja Tentada</TableHead>
                <TableHead className="text-xs">Tipo</TableHead>
                <TableHead className="text-xs">Motivo</TableHead>
                <TableHead className="text-xs">Fase</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {loading ? "Carregando..." : "Nenhum registro de auditoria encontrado."}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map(log => {
                const d = log.detalhes ?? {};
                return (
                  <TableRow key={log.id} className="text-xs">
                    <TableCell className="whitespace-nowrap font-mono">
                      {format(new Date(log.created_at), "dd/MM/yy HH:mm:ss", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="font-medium">{d.email || "—"}</TableCell>
                    <TableCell className="font-mono">{d.codigo_loja_digitado || "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={getTenantLabel(d.tenant_id_tentado || log.tenant_id)}>
                      {getTenantLabel(d.tenant_id_tentado || log.tenant_id)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getMotivoColor(d.tipo)} className="text-[10px] whitespace-nowrap">
                        {(d.tipo || log.acao || "—").replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[250px] truncate" title={d.motivo || ""}>
                      {d.motivo || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {d.fase || "—"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="p-3 text-xs text-muted-foreground border-t">
          {filtered.length} registro(s) exibido(s) de {logs.length} carregado(s)
        </div>
      </CardContent>
    </Card>
  );
}