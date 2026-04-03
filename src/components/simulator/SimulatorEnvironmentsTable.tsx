import { useState, useEffect, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, ChevronDown, ChevronRight, ChevronsUpDown, Wrench, AlertCircle, Layers, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/financing";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
  fileFormat?: "XML" | "TXT" | "PROMOB";
}

type TechField = keyof Pick<ImportedEnvironment, "corpo" | "porta" | "puxador" | "complemento" | "modelo" | "fornecedor">;

interface Props {
  environments: ImportedEnvironment[];
  onUpdateName: (id: string, name: string) => void;
  onUpdateTechnical?: (id: string, field: TechField, value: string) => void;
  onRemove: (id: string) => void;
  canDelete: boolean;
}

const TECH_FIELDS: { key: TechField; label: string; placeholder: string }[] = [
  { key: "corpo", label: "Corpo", placeholder: "15mm Branco" },
  { key: "porta", label: "Porta", placeholder: "18mm Grafite" },
  { key: "puxador", label: "Puxador", placeholder: "Modelo / Cor" },
  { key: "complemento", label: "Complemento", placeholder: "Dobradiças, corrediças..." },
  { key: "modelo", label: "Modelo", placeholder: "Linha / Coleção" },
  { key: "fornecedor", label: "Fornecedor", placeholder: "Fabricante" },
];

const REQUIRED_TECH_KEYS: TechField[] = ["corpo", "porta", "puxador", "fornecedor"];

function TechBadge({ value, label }: { value?: string; label: string }) {
  if (!value) return null;
  return (
    <Badge variant="outline" className="text-[9px] font-normal gap-0.5 py-0 h-4">
      <span className="text-muted-foreground">{label}:</span> {value}
    </Badge>
  );
}

const hasTechData = (env: ImportedEnvironment) =>
  !!(env.corpo || env.porta || env.puxador || env.complemento || env.modelo || env.fornecedor);

const isIncomplete = (env: ImportedEnvironment) =>
  REQUIRED_TECH_KEYS.some(k => !env[k]?.trim());

const missingCount = (env: ImportedEnvironment) =>
  REQUIRED_TECH_KEYS.filter(k => !env[k]?.trim()).length;

/* ── Batch Fill Panel ──────────────────────────────────────────── */

interface BatchFillProps {
  environments: ImportedEnvironment[];
  onUpdateTechnical?: (id: string, field: TechField, value: string) => void;
}

function BatchFillPanel({ environments, onUpdateTechnical }: BatchFillProps) {
  const [batchValues, setBatchValues] = useState<Record<TechField, string>>({
    corpo: "", porta: "", puxador: "", complemento: "", modelo: "", fornecedor: "",
  });
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [applied, setApplied] = useState(false);

  const hasAnyValue = Object.values(batchValues).some(v => v.trim());

  const handleApply = useCallback(() => {
    if (!onUpdateTechnical || !hasAnyValue) return;
    for (const env of environments) {
      for (const { key } of TECH_FIELDS) {
        const newVal = batchValues[key].trim();
        if (!newVal) continue;
        const existingVal = env[key]?.trim();
        if (existingVal && !overwriteExisting) continue;
        onUpdateTechnical(env.id, key, newVal);
      }
    }
    setApplied(true);
    setTimeout(() => setApplied(false), 2000);
  }, [batchValues, environments, onUpdateTechnical, overwriteExisting, hasAnyValue]);

  return (
    <div className="border border-dashed border-primary/30 rounded-md p-3 bg-primary/5">
      <div className="flex items-center gap-1.5 mb-2">
        <Layers className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-semibold text-foreground">Preenchimento em Lote</span>
        <span className="text-[10px] text-muted-foreground ml-1">— preencha e aplique a todos os ambientes</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-1.5 mb-2">
        {TECH_FIELDS.map(({ key, label, placeholder }) => (
          <div key={key} className="flex flex-col gap-0.5">
            <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </label>
            <Input
              value={batchValues[key]}
              onChange={(e) => setBatchValues(prev => ({ ...prev, [key]: e.target.value }))}
              className="h-6 text-[11px] bg-background"
              placeholder={placeholder}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={overwriteExisting}
            onChange={(e) => setOverwriteExisting(e.target.checked)}
            className="rounded border-muted-foreground/40 h-3 w-3"
          />
          Sobrescrever campos já preenchidos
        </label>
        <Button
          size="sm"
          className="h-6 text-[10px] gap-1"
          disabled={!hasAnyValue}
          onClick={handleApply}
        >
          {applied ? <><Check className="h-3 w-3" /> Aplicado!</> : <>Aplicar a {environments.length} ambiente{environments.length !== 1 ? "s" : ""}</>}
        </Button>
      </div>
    </div>
  );
}

/* ── Main Table ────────────────────────────────────────────────── */

export function SimulatorEnvironmentsTable({ environments, onUpdateName, onUpdateTechnical, onRemove, canDelete }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [autoExpandedIds] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);

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

  const allExpanded = environments.every(env => expandedIds.has(env.id));
  const toggleAll = () => {
    setExpandedIds(allExpanded ? new Set() : new Set(environments.map(env => env.id)));
  };

  const incompleteCount = environments.filter(isIncomplete).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        {incompleteCount > 0 ? (
          <div className="flex items-center gap-1.5 text-amber-500">
            <AlertCircle className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium">
              {incompleteCount} {incompleteCount === 1 ? "ambiente" : "ambientes"} com campos pendentes
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-muted-foreground">✓ Todos os campos técnicos preenchidos</span>
        )}
        <div className="flex items-center gap-1">
          {environments.length > 1 && onUpdateTechnical && (
            <Button
              variant={batchOpen ? "secondary" : "ghost"}
              size="sm"
              className="h-6 text-[10px] text-muted-foreground gap-1"
              onClick={() => setBatchOpen(!batchOpen)}
            >
              <Layers className="h-3 w-3" />
              Em Lote
            </Button>
          )}
          {environments.some(hasTechData) && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground gap-1" onClick={toggleAll}>
              <ChevronsUpDown className="h-3 w-3" />
              {allExpanded ? "Recolher Todos" : "Expandir Todos"}
            </Button>
          )}
        </div>
      </div>

      {batchOpen && environments.length > 1 && onUpdateTechnical && (
        <div className="mb-2">
          <BatchFillPanel environments={environments} onUpdateTechnical={onUpdateTechnical} />
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
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={env.environmentName}
                          onChange={(e) => onUpdateName(env.id, e.target.value)}
                          className="h-6 text-xs border-none bg-transparent p-0 focus-visible:ring-1 focus-visible:ring-primary/50"
                        />
                        {env.fileFormat && (
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[8px] font-semibold px-1.5 py-0 h-4 shrink-0",
                              env.fileFormat === "XML" && "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
                              env.fileFormat === "TXT" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                              env.fileFormat === "PROMOB" && "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
                            )}
                          >
                            {env.fileFormat}
                          </Badge>
                        )}
                      </div>
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
                        {TECH_FIELDS.map(({ key, label, placeholder }) => {
                          const isEmpty = !env[key]?.trim();
                          const isRequired = (REQUIRED_TECH_KEYS as readonly string[]).includes(key);
                          return (
                            <div key={key} className="flex flex-col gap-0.5">
                              <label className={cn("text-[9px] font-medium uppercase tracking-wider", isEmpty && isRequired ? "text-amber-500" : "text-muted-foreground")}>
                                {label}{isEmpty && isRequired && " •"}
                              </label>
                              <Input
                                value={env[key] || ""}
                                onChange={(e) => onUpdateTechnical?.(env.id, key, e.target.value)}
                                className={cn("h-6 text-[11px] bg-background", isEmpty && isRequired && "border-amber-500/50 focus-visible:ring-amber-500/30")}
                                placeholder={placeholder}
                                readOnly={!onUpdateTechnical}
                              />
                            </div>
                          );
                        })}
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
