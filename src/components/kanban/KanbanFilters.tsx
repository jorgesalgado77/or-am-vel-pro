/**
 * Filter bar for the Kanban board.
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Search, Filter, X, CalendarIcon, Plus } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface KanbanFiltersProps {
  search: string;
  setSearch: (v: string) => void;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  hasActiveFilters: boolean;
  filterProjetista: string;
  setFilterProjetista: (v: string) => void;
  filterIndicador: string;
  setFilterIndicador: (v: string) => void;
  filterTemperature: string;
  setFilterTemperature: (v: string) => void;
  filterTipoCliente: string;
  setFilterTipoCliente: (v: string) => void;
  periodFilter: string;
  setPeriodFilter: (v: string) => void;
  dateStart: Date | undefined;
  setDateStart: (v: Date | undefined) => void;
  dateEnd: Date | undefined;
  setDateEnd: (v: Date | undefined) => void;
  projetistas: { id: string; apelido: string | null; nome_completo: string }[];
  indicadores: { id: string; nome: string; comissao_percentual: number; ativo: boolean }[];
  filteredCount: number;
  onClear: () => void;
  onAdd: () => void;
}

export function KanbanFilters(props: KanbanFiltersProps) {
  return (
    <>
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-4 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, CPF/CNPJ..." value={props.search} onChange={(e) => props.setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2">
          <Button variant={props.showFilters ? "secondary" : "outline"} size="sm" className="gap-2 flex-1 sm:flex-none" onClick={() => props.setShowFilters(!props.showFilters)}>
            <Filter className="h-4 w-4" /><span className="hidden sm:inline">Filtros</span>
            {props.hasActiveFilters && <Badge variant="default" className="h-5 px-1.5 text-xs ml-1">!</Badge>}
          </Button>
          <Button onClick={props.onAdd} className="gap-2 flex-1 sm:flex-none"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Novo Cliente</span></Button>
        </div>
      </div>

      {/* Filter panel */}
      {props.showFilters && (
        <div className="flex items-end gap-3 mb-4 p-3 bg-muted/30 rounded-lg border border-border flex-wrap">
          <div className="min-w-[160px]">
            <Label className="text-xs mb-1 block">Período</Label>
            <Select value={props.periodFilter} onValueChange={props.setPeriodFilter}>
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
          {props.periodFilter === "personalizado" && (
            <>
              <div>
                <Label className="text-xs mb-1 block">De</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-[130px] justify-start text-left font-normal h-9", !props.dateStart && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      {props.dateStart ? format(props.dateStart, "dd/MM/yy") : "Início"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={props.dateStart} onSelect={props.setDateStart} locale={ptBR} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Até</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-[130px] justify-start text-left font-normal h-9", !props.dateEnd && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      {props.dateEnd ? format(props.dateEnd, "dd/MM/yy") : "Fim"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={props.dateEnd} onSelect={props.setDateEnd} locale={ptBR} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}
          <div className="min-w-[160px]">
            <Label className="text-xs mb-1 block">Projetista</Label>
            <Select value={props.filterProjetista || "_all"} onValueChange={(v) => props.setFilterProjetista(v === "_all" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos</SelectItem>
                {props.projetistas.map((p) => (
                  <SelectItem key={p.id} value={p.apelido || p.nome_completo}>{p.apelido || p.nome_completo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[160px]">
            <Label className="text-xs mb-1 block">Indicador</Label>
            <Select value={props.filterIndicador || "_all"} onValueChange={(v) => props.setFilterIndicador(v === "_all" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos</SelectItem>
                {props.indicadores.filter(i => i.ativo).map((ind) => (
                  <SelectItem key={ind.id} value={ind.id}>{ind.nome} ({ind.comissao_percentual}%)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[140px]">
            <Label className="text-xs mb-1 block">Temperatura</Label>
            <Select value={props.filterTemperature || "_all"} onValueChange={(v) => props.setFilterTemperature(v === "_all" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todas</SelectItem>
                <SelectItem value="quente">🔥 Quente</SelectItem>
                <SelectItem value="morno">🟡 Morno</SelectItem>
                <SelectItem value="frio">❄️ Frio</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[140px]">
            <Label className="text-xs mb-1 block">Tipo</Label>
            <Select value={props.filterTipoCliente || "_all"} onValueChange={(v) => props.setFilterTipoCliente(v === "_all" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos</SelectItem>
                <SelectItem value="recente">👤 Cliente Loja</SelectItem>
                <SelectItem value="lead">📩 Lead Recebido</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Badge variant="secondary" className="h-7 px-2.5 text-xs font-medium">
              {props.filteredCount} {props.filteredCount === 1 ? "cliente" : "clientes"}
            </Badge>
            {props.hasActiveFilters && (
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground h-9" onClick={props.onClear}>
                <X className="h-3 w-3" />Limpar
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
