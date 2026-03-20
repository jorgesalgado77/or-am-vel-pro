import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { RefreshCw, Search, CalendarIcon, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface DiagnosticEntry {
  id: string;
  email: string | null;
  tenant_id: string | null;
  cargo: string | null;
  resultado: string;
  detalhes: any;
  created_at: string;
}

export function AdminLoginDiagnostics() {
  const [entries, setEntries] = useState<DiagnosticEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [emailFilter, setEmailFilter] = useState("");
  const [resultFilter, setResultFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const fetchEntries = async () => {
    setLoading(true);
    let query = supabase
      .from("login_diagnostics" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (emailFilter.trim()) {
      query = query.ilike("email", `%${emailFilter.trim()}%`);
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
    setResultFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const getResultBadge = (resultado: string) => {
    switch (resultado) {
      case "sucesso": return <Badge className="bg-green-500/10 text-green-700 border-green-200">Sucesso</Badge>;
      case "erro_auth": return <Badge variant="destructive">Erro Auth</Badge>;
      case "sem_vinculo": return <Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-200">Sem Vínculo</Badge>;
      case "tenant_incorreto": return <Badge className="bg-orange-500/10 text-orange-700 border-orange-200">Tenant Incorreto</Badge>;
      case "auto_reparo": return <Badge className="bg-blue-500/10 text-blue-700 border-blue-200">Auto-Reparo</Badge>;
      default: return <Badge variant="secondary">{resultado}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Diagnóstico de Login</h3>
        <Button variant="outline" size="sm" onClick={fetchEntries} className="gap-2">
          <RefreshCw className="h-3 w-3" /> Atualizar
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
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
            <div className="w-40">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Resultado</label>
              <Select value={resultFilter} onValueChange={setResultFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="sucesso">Sucesso</SelectItem>
                  <SelectItem value="erro_auth">Erro Auth</SelectItem>
                  <SelectItem value="sem_vinculo">Sem Vínculo</SelectItem>
                  <SelectItem value="tenant_incorreto">Tenant Incorreto</SelectItem>
                  <SelectItem value="auto_reparo">Auto-Reparo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Data início</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-36 justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "De"}
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
                    {dateTo ? format(dateTo, "dd/MM/yyyy") : "Até"}
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
                <TableHead>Resultado</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Tenant ID</TableHead>
                <TableHead>Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
              ) : entries.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum registro encontrado</TableCell></TableRow>
              ) : entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {format(new Date(e.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-sm">{e.email || "—"}</TableCell>
                  <TableCell>{getResultBadge(e.resultado)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.cargo || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono max-w-[120px] truncate">{e.tenant_id ? e.tenant_id.slice(0, 8) + "..." : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {e.detalhes ? JSON.stringify(e.detalhes).slice(0, 80) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-right">Mostrando últimos {entries.length} registros</p>
    </div>
  );
}
