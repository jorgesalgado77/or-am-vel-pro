import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Search, RefreshCw, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";


interface AuditLog {
  id: string;
  acao: string;
  entidade: string;
  entidade_id: string | null;
  usuario_id: string | null;
  usuario_nome: string | null;
  detalhes: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  cliente_criado: "Cliente criado",
  cliente_atualizado: "Cliente atualizado",
  cliente_excluido: "Cliente excluído",
  simulacao_salva: "Simulação salva",
  venda_fechada: "Venda fechada",
  contrato_gerado: "Contrato gerado",
  comissoes_geradas: "Comissões geradas",
  desconto_desbloqueado: "Desconto desbloqueado",
  plus_desbloqueado: "Plus desbloqueado",
  status_tracking_alterado: "Status alterado",
  comissao_status_alterado: "Comissão alterada",
  usuario_login: "Login",
  senha_alterada: "Senha alterada",
};

const ACTION_COLORS: Record<string, string> = {
  cliente_criado: "bg-green-100 text-green-800",
  cliente_excluido: "bg-red-100 text-red-800",
  venda_fechada: "bg-blue-100 text-blue-800",
  usuario_login: "bg-gray-100 text-gray-800",
  desconto_desbloqueado: "bg-yellow-100 text-yellow-800",
  plus_desbloqueado: "bg-yellow-100 text-yellow-800",
  senha_alterada: "bg-orange-100 text-orange-800",
};

export function AuditLogsTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchUser, setSearchUser] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (filterAction !== "all") {
      query = query.eq("acao", filterAction);
    }
    if (dateFrom) {
      query = query.gte("created_at", new Date(dateFrom).toISOString());
    }
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      query = query.lte("created_at", end.toISOString());
    }

    const { data, error } = await query;
    if (error) {
      toast.error("Erro ao carregar logs: " + error.message);
    } else {
      setLogs((data as unknown as AuditLog[]) || []);
    }
    setLoading(false);
  }, [filterAction, dateFrom, dateTo]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const filtered = useMemo(() => {
    if (!searchUser.trim()) return logs;
    const q = searchUser.toLowerCase();
    return logs.filter(
      (l) =>
        l.usuario_nome?.toLowerCase().includes(q) ||
        l.usuario_id?.toLowerCase().includes(q)
    );
  }, [logs, searchUser]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [searchUser, filterAction, dateFrom, dateTo]);

  const uniqueActions = useMemo(() => {
    const set = new Set(logs.map((l) => l.acao));
    return Array.from(set).sort();
  }, [logs]);

  const exportToExcel = useCallback(async () => {
    if (filtered.length === 0) {
      toast.error("Nenhum registro para exportar");
      return;
    }
    const rows = filtered.map((l) => ({
      "Data/Hora": format(new Date(l.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }),
      "Ação": ACTION_LABELS[l.acao] || l.acao,
      "Entidade": l.entidade,
      "ID Entidade": l.entidade_id || "",
      "Usuário": l.usuario_nome || "",
      "ID Usuário": l.usuario_id || "",
      "Detalhes": l.detalhes ? JSON.stringify(l.detalhes) : "",
    }));
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Logs de Auditoria");
    XLSX.writeFile(wb, `audit_logs_${format(new Date(), "yyyy-MM-dd_HHmm")}.xlsx`);
    toast.success(`${filtered.length} registros exportados`);
  }, [filtered]);

  const exportToCsv = useCallback(() => {
    if (filtered.length === 0) {
      toast.error("Nenhum registro para exportar");
      return;
    }
    const header = "Data/Hora;Ação;Entidade;ID Entidade;Usuário;ID Usuário;Detalhes\n";
    const rows = filtered.map((l) =>
      [
        format(new Date(l.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }),
        ACTION_LABELS[l.acao] || l.acao,
        l.entidade,
        l.entidade_id || "",
        l.usuario_nome || "",
        l.usuario_id || "",
        l.detalhes ? JSON.stringify(l.detalhes).replace(/;/g, ",") : "",
      ].join(";")
    ).join("\n");

    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit_logs_${format(new Date(), "yyyy-MM-dd_HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length} registros exportados`);
  }, [filtered]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">Logs de Auditoria</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchLogs} className="gap-1">
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={exportToCsv} className="gap-1">
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportToExcel} className="gap-1">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Buscar por usuário</Label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
                placeholder="Nome do usuário..."
                className="pl-8 h-9 text-sm"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Filtrar por ação</Label>
            <Select value={filterAction} onValueChange={setFilterAction}>
              <SelectTrigger className="mt-1 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ações</SelectItem>
                {uniqueActions.map((a) => (
                  <SelectItem key={a} value={a}>{ACTION_LABELS[a] || a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Data inicial</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Data final</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1 h-9 text-sm"
            />
          </div>
        </div>

        {/* Results count */}
        <p className="text-xs text-muted-foreground">
          {filtered.length} registro{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
        </p>

        {/* Table */}
        <div className="rounded-md border overflow-auto max-h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-[140px]">Data/Hora</TableHead>
                <TableHead className="text-xs">Ação</TableHead>
                <TableHead className="text-xs">Usuário</TableHead>
                <TableHead className="text-xs">Entidade</TableHead>
                <TableHead className="text-xs">Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    Nenhum registro encontrado
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(log.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-xs ${ACTION_COLORS[log.acao] || ""}`}>
                        {ACTION_LABELS[log.acao] || log.acao}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{log.usuario_nome || "—"}</TableCell>
                    <TableCell className="text-xs capitalize">{log.entidade}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate" title={log.detalhes ? JSON.stringify(log.detalhes) : ""}>
                      {log.detalhes ? summarizeDetails(log.detalhes) : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Página {currentPage} de {totalPages}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                Próxima
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function summarizeDetails(detalhes: Record<string, unknown>): string {
  const parts: string[] = [];
  if (detalhes.nome) parts.push(`${detalhes.nome}`);
  if (detalhes.cliente) parts.push(`${detalhes.cliente}`);
  if (detalhes.valor) parts.push(`R$ ${Number(detalhes.valor).toFixed(2)}`);
  if (detalhes.contrato) parts.push(`#${detalhes.contrato}`);
  if (parts.length > 0) return parts.join(" • ");
  const keys = Object.keys(detalhes).slice(0, 3);
  return keys.map((k) => `${k}: ${String(detalhes[k]).slice(0, 20)}`).join(", ");
}
