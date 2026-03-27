import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { TASK_TYPES, DATE_FILTER_OPTIONS, type DateFilterPreset } from "./taskTypes";

interface UserOption {
  id: string;
  nome: string;
}

interface Props {
  dateFilter: DateFilterPreset;
  onDateFilterChange: (v: DateFilterPreset) => void;
  typeFilter: string;
  onTypeFilterChange: (v: string) => void;
  responsavelFilter: string;
  onResponsavelFilterChange: (v: string) => void;
  usuarios: UserOption[];
  customStart: string;
  customEnd: string;
  onCustomStartChange: (v: string) => void;
  onCustomEndChange: (v: string) => void;
}

export function TaskFilters({ dateFilter, onDateFilterChange, typeFilter, onTypeFilterChange, responsavelFilter, onResponsavelFilterChange, usuarios, customStart, customEnd, onCustomStartChange, onCustomEndChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={dateFilter} onValueChange={(v) => onDateFilterChange(v as DateFilterPreset)}>
        <SelectTrigger className="w-[150px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DATE_FILTER_OPTIONS.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={typeFilter} onValueChange={onTypeFilterChange}>
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos os tipos</SelectItem>
          {TASK_TYPES.map(t => (
            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={responsavelFilter} onValueChange={onResponsavelFilterChange}>
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="Responsável" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos</SelectItem>
          <SelectItem value="meus">Minhas tarefas</SelectItem>
          {usuarios.map(u => (
            <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {dateFilter === "personalizado" && (
        <>
          <Input type="date" value={customStart} onChange={e => onCustomStartChange(e.target.value)} className="w-[140px] h-8 text-xs" />
          <Input type="date" value={customEnd} onChange={e => onCustomEndChange(e.target.value)} className="w-[140px] h-8 text-xs" />
        </>
      )}
    </div>
  );
}
