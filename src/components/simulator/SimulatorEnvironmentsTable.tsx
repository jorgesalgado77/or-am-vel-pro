import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, ChevronDown, ChevronRight, ChevronsUpDown, Wrench, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/financing";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export interface ImportedEnvironment {
  id: string;
  fileName: string;
  environmentName: string;
  pieceCount: number;
  totalValue: number;
  importedAt: Date;
  file: File;
  fornecedor?: string;
  corpo?: string;
  porta?: string;
  puxador?: string;
  complemento?: string;
  modelo?: string;
}

interface Props {
  environments: ImportedEnvironment[];
  onUpdateName: (id: string, name: string) => void;
  onUpdateTechnical?: (id: string, field: keyof Pick<ImportedEnvironment, "corpo" | "porta" | "puxador" | "complemento" | "modelo" | "fornecedor">, value: string) => void;
  onRemove: (id: string) => void;
  canDelete: boolean;
}

const TECH_FIELDS: { key: keyof Pick<ImportedEnvironment, "corpo" | "porta" | "puxador" | "complemento" | "modelo" | "fornecedor">; label: string; placeholder: string }[] = [
  { key: "corpo", label: "Corpo", placeholder: "15mm Branco" },
  { key: "porta", label: "Porta", placeholder: "18mm Grafite" },
  { key: "puxador", label: "Puxador", placeholder: "Modelo / Cor" },
  { key: "complemento", label: "Complemento", placeholder: "Dobradiças, corrediças..." },
  { key: "modelo", label: "Modelo", placeholder: "Linha / Coleção" },
  { key: "fornecedor", label: "Fornecedor", placeholder: "Fabricante" },
];

function TechBadge({ value, label }: { value?: string; label: string }) {
  if (!value) return null;
  return (
    <Badge variant="outline" className="text-[9px] font-normal gap-0.5 py-0 h-4">
      <span className="text-muted-foreground">{label}:</span> {value}
    </Badge>
  );
}

export function SimulatorEnvironmentsTable({ environments, onUpdateName, onUpdateTechnical, onRemove, canDelete }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [autoExpandedIds] = useState<Set<string>>(new Set());

  // Auto-expand environments that have technical data detected
  useEffect(() => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      let changed = false;
      for (const env of environments) {
        if (hasTechData(env) && !autoExpandedIds.has(env.id) && !next.has(env.id)) {
          next.add(env.id);
          autoExpandedIds.add(env.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [environments]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (environments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 py-4 text-muted-foreground">
        <Upload className="h-5 w-5" />
        <p className="text-xs">Nenhum ambiente importado</p>
        <p className="text-[10px]">Clique no botão acima para importar arquivos TXT, XML ou Promob</p>
      </div>
    );
  }

  const hasTechData = (env: ImportedEnvironment) =>
    !!(env.corpo || env.porta || env.puxador || env.complemento || env.modelo || env.fornecedor);

  const REQUIRED_TECH_KEYS: (keyof Pick<ImportedEnvironment, "corpo" | "porta" | "puxador" | "fornecedor">)[] = ["corpo", "porta", "puxador", "fornecedor"];
  const isIncomplete = (env: ImportedEnvironment) =>
    REQUIRED_TECH_KEYS.some(k => !env[k]?.trim());
  const missingCount = (env: ImportedEnvironment) =>
    REQUIRED_TECH_KEYS.filter(k => !env[k]?.trim()).length;

  const allExpanded = environments.length > 0 && environments.every(env => expandedIds.has(env.id));
  const toggleAll = () => {
    if (allExpanded) {
      setExpandedIds(new Set());
    } else {
      setExpandedIds(new Set(environments.map(env => env.id)));
    }
  };

  return (
    <div>
      {environments.some(hasTechData) && (
        <div className="flex justify-end mb-1">
          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground gap-1" onClick={toggleAll}>
            {allExpanded ? <ChevronsUpDown className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3" />}
            {allExpanded ? "Recolher Todos" : "Expandir Todos"}
          </Button>
        </div>
      )}
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/30">
          <TableHead className="text-xs py-1.5 h-auto w-6"></TableHead>
          <TableHead className="text-xs py-1.5 h-auto">Ambiente</TableHead>
          <TableHead className="text-xs py-1.5 h-auto text-center">Peças</TableHead>
          <TableHead className="text-xs py-1.5 h-auto text-right">Valor</TableHead>
          <TableHead className="text-xs py-1.5 h-auto text-center">Data</TableHead>
          <TableHead className="text-xs py-1.5 h-auto w-8"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {environments.map((env) => {
          const isExpanded = expandedIds.has(env.id);
          const hasTech = hasTechData(env);
          const incomplete = isIncomplete(env);
          const missing = missingCount(env);
          return (
            <>
              <TableRow key={env.id} className={cn("text-xs", incomplete && "border-l-2 border-l-amber-500")}>
                <TableCell className="py-1.5 px-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-5 w-5", incomplete ? "text-amber-500" : hasTech ? "text-primary" : "text-muted-foreground/50")}
                    onClick={() => toggleExpand(env.id)}
                    title={incomplete ? `${missing} campo(s) técnico(s) pendente(s)` : hasTech ? "Ver dados técnicos extraídos" : "Sem dados técnicos"}
                  >
                    {incomplete && !isExpanded ? <AlertCircle className="h-3 w-3" /> : isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </Button>
                </TableCell>
                <TableCell className="py-1.5 font-medium">
                  <div className="flex flex-col gap-0.5">
                    <Input
                      value={env.environmentName}
                      onChange={(e) => onUpdateName(env.id, e.target.value)}
                      className="h-6 text-xs border-none bg-transparent p-0 focus-visible:ring-1 focus-visible:ring-primary/50"
                    />
                    {!isExpanded && hasTech && (
                      <div className="flex flex-wrap gap-0.5">
                        <TechBadge value={env.corpo} label="C" />
                        <TechBadge value={env.porta} label="P" />
                        <TechBadge value={env.puxador} label="Pux" />
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-1.5 text-center">{env.pieceCount || "—"}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{formatCurrency(env.totalValue)}</TableCell>
                <TableCell className="py-1.5 text-center text-muted-foreground">
                  {format(env.importedAt, "dd/MM HH:mm")}
                </TableCell>
                <TableCell className="py-1.5 text-center">
                  <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:text-destructive" onClick={() => onRemove(env.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>

              {/* Technical details expandable row */}
              {isExpanded && (
                <TableRow key={`${env.id}-tech`} className="bg-muted/20 hover:bg-muted/30">
                  <TableCell colSpan={6} className="py-2 px-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Wrench className="h-3 w-3 text-primary" />
                      <span className="text-[10px] font-semibold text-foreground">Dados Técnicos Extraídos</span>
                      {!hasTech && (
                        <span className="text-[10px] text-muted-foreground ml-1">— nenhum dado detectado no arquivo</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-1.5">
                      {TECH_FIELDS.map(({ key, label, placeholder }) => (
                        <div key={key} className="flex flex-col gap-0.5">
                          <label className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">{label}</label>
                          <Input
                            value={env[key] || ""}
                            onChange={(e) => onUpdateTechnical?.(env.id, key, e.target.value)}
                            className="h-6 text-[11px] bg-background"
                            placeholder={placeholder}
                            readOnly={!onUpdateTechnical}
                          />
                        </div>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </>
          );
        })}
        {environments.length > 1 && (
          <TableRow className="bg-primary/5 font-semibold text-xs">
            <TableCell className="py-1.5"></TableCell>
            <TableCell className="py-1.5">Total ({environments.length} ambientes)</TableCell>
            <TableCell className="py-1.5 text-center">{environments.reduce((s, e) => s + e.pieceCount, 0) || "—"}</TableCell>
            <TableCell className="py-1.5 text-right tabular-nums text-primary">{formatCurrency(environments.reduce((s, e) => s + e.totalValue, 0))}</TableCell>
            <TableCell className="py-1.5"></TableCell>
            <TableCell className="py-1.5"></TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
    </div>
  );
}
