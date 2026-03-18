import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Pencil, Trash2, Plus, Search, Calculator, History, AlertTriangle, CalendarIcon, Filter, X, FileText } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/financing";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useIndicadores } from "@/hooks/useIndicadores";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { format, addDays, isPast, isAfter, isBefore, startOfDay, endOfDay, startOfMonth, subMonths, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

interface LastSimInfo {
  valor_final: number;
  created_at: string;
}

interface ClientsTableProps {
  clients: Client[];
  loading: boolean;
  onEdit: (client: Client) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onSimulate: (client: Client) => void;
  onHistory: (client: Client) => void;
  onContracts: (client: Client) => void;
}

export function ClientsTable({ clients, loading, onEdit, onDelete, onAdd, onSimulate, onHistory, onContracts }: ClientsTableProps) {
  const [search, setSearch] = useState("");
  const [filterProjetista, setFilterProjetista] = useState("");
  const [filterIndicador, setFilterIndicador] = useState("");
  const [periodFilter, setPeriodFilter] = useState("mes_atual");
  const [dateStart, setDateStart] = useState<Date | undefined>(undefined);
  const [dateEnd, setDateEnd] = useState<Date | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(true);
  const [lastSims, setLastSims] = useState<Record<string, LastSimInfo>>({});
  const { settings } = useCompanySettings();
  const { projetistas } = useUsuarios();
  const { indicadores } = useIndicadores();
  const { currentUser } = useCurrentUser();

  const cargoNome = currentUser?.cargo_nome?.toLowerCase() || "";
  const canEdit = !currentUser || cargoNome === "administrador" || cargoNome === "gerente";
  const canDelete = !currentUser || cargoNome === "administrador";

  const indicadorMap = useMemo(() => {
    const map: Record<string, { nome: string; comissao: number }> = {};
    indicadores.forEach(i => { map[i.id] = { nome: i.nome, comissao: i.comissao_percentual }; });
    return map;
  }, [indicadores]);

  useEffect(() => {
    if (clients.length === 0) return;
    const fetchLastSims = async () => {
      const { data } = await supabase
        .from("simulations")
        .select("client_id, valor_final, created_at")
        .order("created_at", { ascending: false });
      if (!data) return;
      const map: Record<string, LastSimInfo> = {};
      data.forEach((s) => {
        if (!map[s.client_id]) {
          map[s.client_id] = { valor_final: Number(s.valor_final) || 0, created_at: s.created_at };
        }
      });
      setLastSims(map);
    };
    fetchLastSims();
  }, [clients]);

  // Compute effective date range from period filter
  const effectiveDates = useMemo(() => {
    const now = new Date();
    let start: Date | undefined;
    let end: Date | undefined;

    switch (periodFilter) {
      case "mes_atual":
        start = startOfMonth(now);
        end = now;
        break;
      case "mes_anterior": {
        const prev = subMonths(now, 1);
        start = startOfMonth(prev);
        end = endOfDay(new Date(prev.getFullYear(), prev.getMonth() + 1, 0));
        break;
      }
      case "60_dias":
        start = subDays(now, 60);
        end = now;
        break;
      case "90_dias":
        start = subDays(now, 90);
        end = now;
        break;
      case "6_meses":
        start = subMonths(now, 6);
        end = now;
        break;
      case "personalizado":
        start = dateStart;
        end = dateEnd;
        break;
      case "todos":
      default:
        start = undefined;
        end = undefined;
        break;
    }
    return { start, end };
  }, [periodFilter, dateStart, dateEnd]);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      const q = search.toLowerCase().trim();

      if (q) {
        const matchesText =
          c.nome.toLowerCase().includes(q) ||
          (c.cpf || "").toLowerCase().includes(q) ||
          (c.vendedor || "").toLowerCase().includes(q) ||
          (c.email || "").toLowerCase().includes(q) ||
          ((c as any).numero_orcamento || "").toLowerCase().includes(q);
        if (!matchesText) return false;
      }

      if (filterProjetista && c.vendedor !== filterProjetista) return false;
      if (filterIndicador && c.indicador_id !== filterIndicador) return false;

      // Date filtering
      const { start, end } = effectiveDates;
      if (start || end) {
        const clientDate = new Date(c.created_at);
        if (start && isBefore(clientDate, startOfDay(start))) return false;
        if (end && isAfter(clientDate, endOfDay(end))) return false;
      }

      return true;
    });
  }, [clients, search, filterProjetista, filterIndicador, effectiveDates]);

  const isExpired = (createdAt: string) => {
    const expiryDate = addDays(new Date(createdAt), settings.budget_validity_days);
    return isPast(expiryDate);
  };

  const hasActiveFilters = filterProjetista || filterIndicador || periodFilter !== "mes_atual";

  const clearFilters = () => {
    setFilterProjetista("");
    setFilterIndicador("");
    setPeriodFilter("mes_atual");
    setDateStart(undefined);
    setDateEnd(undefined);
    setSearch("");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search bar + action buttons */}
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, CPF/CNPJ, nº orçamento..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2">
          <Button variant={showFilters ? "secondary" : "outline"} size="sm" className="gap-2" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4" />Filtros
            {hasActiveFilters && <Badge variant="default" className="h-5 px-1.5 text-xs ml-1">!</Badge>}
          </Button>
          <Button onClick={onAdd} className="gap-2"><Plus className="h-4 w-4" />Novo Cliente</Button>
        </div>
      </div>

      {/* Advanced filters row */}
      {showFilters && (
        <div className="flex items-end gap-3 mb-4 p-3 bg-muted/30 rounded-lg border border-border flex-wrap">
          <div className="min-w-[180px]">
            <Label className="text-xs mb-1 block">Período</Label>
            <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mes_atual">Mês Atual</SelectItem>
                <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
                <SelectItem value="60_dias">Últimos 60 dias</SelectItem>
                <SelectItem value="90_dias">Últimos 90 dias</SelectItem>
                <SelectItem value="6_meses">Últimos 6 meses</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="personalizado">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {periodFilter === "personalizado" && (
            <>
              <div>
                <Label className="text-xs mb-1 block">Data Início</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal h-9", !dateStart && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      {dateStart ? format(dateStart, "dd/MM/yyyy") : "Início"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateStart} onSelect={setDateStart} locale={ptBR} className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Data Fim</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal h-9", !dateEnd && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      {dateEnd ? format(dateEnd, "dd/MM/yyyy") : "Fim"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateEnd} onSelect={setDateEnd} locale={ptBR} className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}
          <div className="min-w-[180px]">
            <Label className="text-xs mb-1 block">Projetista</Label>
            <Select value={filterProjetista || "_all"} onValueChange={(v) => setFilterProjetista(v === "_all" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos</SelectItem>
                {projetistas.map((p) => (
                  <SelectItem key={p.id} value={p.apelido || p.nome_completo}>
                    {p.apelido || p.nome_completo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[180px]">
            <Label className="text-xs mb-1 block">Indicador</Label>
            <Select value={filterIndicador || "_all"} onValueChange={(v) => setFilterIndicador(v === "_all" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos</SelectItem>
                {indicadores.filter(i => i.ativo).map((ind) => (
                  <SelectItem key={ind.id} value={ind.id}>
                    {ind.nome} ({ind.comissao_percentual}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground h-9" onClick={clearFilters}>
              <X className="h-3 w-3" />Limpar
            </Button>
          )}
        </div>
      )}

      <div className="border border-border rounded-md bg-card overflow-hidden flex-1">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50">
              <TableHead className="font-medium w-[130px]">Nº Orçamento</TableHead>
              <TableHead className="font-medium">Nome</TableHead>
              <TableHead className="font-medium">CPF/CNPJ</TableHead>
              <TableHead className="font-medium">Telefone</TableHead>
              <TableHead className="font-medium">Projetista</TableHead>
              <TableHead className="font-medium">Último Orçamento</TableHead>
              <TableHead className="font-medium">Validade</TableHead>
              <TableHead className="font-medium">Indicador</TableHead>
              <TableHead className="font-medium w-[150px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  {search || hasActiveFilters ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((client) => {
                const sim = lastSims[client.id];
                const expired = sim ? isExpired(sim.created_at) : false;
                return (
                  <TableRow key={client.id} className={`hover:bg-secondary/30 transition-colors duration-150 ${expired ? "bg-destructive/5" : ""}`}>
                    <TableCell className="font-mono text-sm tabular-nums">{(client as any).numero_orcamento || "—"}</TableCell>
                    <TableCell className="font-medium text-foreground">{client.nome}</TableCell>
                    <TableCell className="text-foreground tabular-nums">{client.cpf || "—"}</TableCell>
                    <TableCell className="text-foreground tabular-nums">{client.telefone1 || "—"}</TableCell>
                    <TableCell className="text-foreground">{client.vendedor || "—"}</TableCell>
                    <TableCell className="tabular-nums">
                      {sim ? (
                        <span className={expired ? "text-destructive font-medium" : "text-foreground font-medium"}>
                          {formatCurrency(sim.valor_final)}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {sim ? (
                        expired ? (
                          <Badge variant="destructive" className="gap-1 text-xs">
                            <AlertTriangle className="h-3 w-3" />Expirado
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Até {format(addDays(new Date(sim.created_at), settings.budget_validity_days), "dd/MM/yyyy")}
                          </span>
                        )
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {client.indicador_id && indicadorMap[client.indicador_id] ? (
                        <span className="text-xs text-foreground">
                          {indicadorMap[client.indicador_id].nome}{" "}
                          <span className="text-muted-foreground">({indicadorMap[client.indicador_id].comissao}%)</span>
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onSimulate(client)} title="Simular">
                          <Calculator className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onHistory(client)} title="Histórico">
                          <History className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onContracts(client)} title="Contratos">
                          <FileText className="h-4 w-4" />
                        </Button>
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(client)} title="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(client.id)} title="Excluir">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
