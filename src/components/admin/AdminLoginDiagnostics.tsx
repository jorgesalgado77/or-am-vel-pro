import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { RefreshCw, Search, CalendarIcon, Trash2, Store, User, ShieldCheck, ShieldAlert, ShieldX, AlertTriangle, UserX, MailWarning, HelpCircle } from "lucide-react";
import { format as fmtDate } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface DiagnosticEntry {
  id: string;
  email: string | null;
  codigo_loja: string | null;
  tenant_id: string | null;
  usuario_id: string | null;
  cargo_nome: string | null;
  auth_user_id: string | null;
  resultado: string;
  detalhes: any;
  created_at: string;
}

const RESULT_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "sucesso", label: "Sucesso" },
  { value: "falha_credencial", label: "Falha Credencial" },
  { value: "falha_tenant", label: "Falha Tenant" },
  { value: "falha_vinculo", label: "Falha Vínculo" },
  { value: "falha_plano", label: "Falha Plano" },
  { value: "falha_inativo", label: "Falha Inativo" },
  { value: "falha_email_nao_confirmado", label: "Email Não Confirmado" },
  { value: "falha_desconhecida", label: "Falha Desconhecida" },
  // Legacy values
  { value: "erro_auth", label: "Erro Auth" },
  { value: "sem_vinculo", label: "Sem Vínculo" },
  { value: "tenant_incorreto", label: "Tenant Incorreto" },
  { value: "auto_reparo", label: "Auto-Reparo" },
];

function getResultBadge(resultado: string) {
  switch (resultado) {
    case "sucesso":
      return <Badge className="bg-green-500/10 text-green-700 border-green-200 gap-1"><ShieldCheck className="h-3 w-3" />Sucesso</Badge>;
    case "falha_credencial":
    case "erro_auth":
      return <Badge variant="destructive" className="gap-1"><ShieldAlert className="h-3 w-3" />Credencial</Badge>;
    case "falha_tenant":
    case "tenant_incorreto":
      return <Badge className="bg-orange-500/10 text-orange-700 border-orange-200 gap-1"><Store className="h-3 w-3" />Tenant</Badge>;
    case "falha_vinculo":
    case "sem_vinculo":
      return <Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-200 gap-1"><UserX className="h-3 w-3" />Vínculo</Badge>;
    case "falha_plano":
      return <Badge className="bg-purple-500/10 text-purple-700 border-purple-200 gap-1"><ShieldX className="h-3 w-3" />Plano</Badge>;
    case "falha_inativo":
      return <Badge className="bg-red-500/10 text-red-700 border-red-200 gap-1"><AlertTriangle className="h-3 w-3" />Inativo</Badge>;
    case "falha_email_nao_confirmado":
      return <Badge className="bg-amber-500/10 text-amber-700 border-amber-200 gap-1"><MailWarning className="h-3 w-3" />Email</Badge>;
    case "auto_reparo":
      return <Badge className="bg-blue-500/10 text-blue-700 border-blue-200 gap-1"><ShieldCheck className="h-3 w-3" />Auto-Reparo</Badge>;
    default:
      return <Badge variant="secondary" className="gap-1"><HelpCircle className="h-3 w-3" />{resultado}</Badge>;
  }
}

export function AdminLoginDiagnostics() {
  const [entries, setEntries] = useState<DiagnosticEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [emailFilter, setEmailFilter] = useState("");
  const [lojaFilter, setLojaFilter] = useState("");
  const [resultFilter, setResultFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const fetchEntries = async () => {
    setLoading(true);
    let query = supabase
      .from("login_diagnostics" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (emailFilter.trim()) {
      query = query.ilike("email", `%${emailFilter.trim()}%`);
    }
    if (lojaFilter.trim()) {
      query = query.ilike("codigo_loja", `%${lojaFilter.trim().replace(/\D/g, "")}%`);
    }
    if (resultFilter !== "all") {
      query = query.eq("resultado", resultFilter);
    }
    if (dateFrom) {
      query = query.gte("created_at", dateFrom.toISOString());
    }
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      query = query.lte("created_at", end.toISOString());
    }

    const { data, error } = await query;
    if (error) {
      toast.error("Erro ao carregar diagnósticos: " + error.message);
    } else {
      setEntries((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchEntries(); }, []);

  const clearFilters = () => {
    setEmailFilter("");
    setLojaFilter("");
    setResultFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  // Stats summary
  const stats = useMemo(() => {
    const total = entries.length;
    const success = entries.filter(e => e.resultado === "sucesso").length;
    const failures = total - success;
    const uniqueEmails = new Set(entries.map(e => e.email).filter(Boolean)).size;
    const uniqueLojas = new Set(entries.map(e => e.codigo_loja).filter(Boolean)).size;
    return { total, success, failures, uniqueEmails, uniqueLojas };
  }, [entries]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Diagnóstico de Login</h3>
        <Button variant="outline" size="sm" onClick={fetchEntries} disabled={loading} className="gap-2">
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} /> Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.success}</p>
          <p className="text-xs text-muted-foreground">Sucesso</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-destructive">{stats.failures}</p>
          <p className="text-xs text-muted-foreground">Falhas</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.uniqueEmails}</p>
          <p className="text-xs text-muted-foreground">Usuários</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.uniqueLojas}</p>
          <p className="text-xs text-muted-foreground">Lojas</p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={emailFilter}
                  onChange={(e) => setEmailFilter(e.target.value)}
                  placeholder="Buscar por email..."
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-36">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Código da Loja</label>
              <div className="relative">
                <Store className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={lojaFilter}
                  onChange={(e) => setLojaFilter(e.target.value)}
                  placeholder="000.000"
                  className="pl-9"
                  maxLength={7}
                />
              </div>
            </div>
            <div className="w-44">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Resultado</label>
              <Select value={resultFilter} onValueChange={setResultFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESULT_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Data início</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-36 justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? fmtDate(dateFrom, "dd/MM/yyyy") : "De"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Data fim</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-36 justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? fmtDate(dateTo, "dd/MM/yyyy") : "Até"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <Button onClick={fetchEntries} size="sm" className="gap-2">
              <Search className="h-3 w-3" /> Filtrar
            </Button>
            <Button onClick={() => { clearFilters(); setTimeout(fetchEntries, 100); }} variant="ghost" size="sm" className="gap-2">
              <Trash2 className="h-3 w-3" /> Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Loja</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Usuário ID</TableHead>
                <TableHead>Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  <RefreshCw className="h-4 w-4 animate-spin inline mr-2" />Carregando...
                </TableCell></TableRow>
              ) : entries.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum registro encontrado</TableCell></TableRow>
              ) : entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {fmtDate(new Date(e.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-sm">{e.email || "—"}</TableCell>
                  <TableCell className="text-sm font-mono">
                    {e.codigo_loja ? e.codigo_loja.replace(/(\d{3})(\d{3})/, "$1.$2") : "—"}
                  </TableCell>
                  <TableCell>{getResultBadge(e.resultado)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.cargo_nome || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono max-w-[100px] truncate" title={e.usuario_id || ""}>
                    {e.usuario_id ? e.usuario_id.slice(0, 8) + "…" : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={e.detalhes ? JSON.stringify(e.detalhes) : ""}>
                    {e.detalhes && Object.keys(e.detalhes).length > 0 ? JSON.stringify(e.detalhes).slice(0, 80) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-right">Mostrando {entries.length} registros (últimos 500)</p>
    </div>
  );
}
