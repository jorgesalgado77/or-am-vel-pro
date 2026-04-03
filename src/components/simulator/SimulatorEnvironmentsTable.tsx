import { useState, useEffect, useCallback, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, ChevronDown, ChevronRight, ChevronsUpDown, Wrench, AlertCircle, Layers, Check, Save, FolderOpen, X, Loader2, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/financing";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import type { ParsedModule, ModuleType } from "@/services/fileImportService";

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
  prazo?: string;
  fileFormat?: "XML" | "TXT" | "PROMOB";
  modules?: ParsedModule[];
}

type TechField = keyof Pick<ImportedEnvironment, "corpo" | "porta" | "puxador" | "complemento" | "modelo" | "fornecedor" | "prazo">;

interface Props {
  environments: ImportedEnvironment[];
  onUpdateName: (id: string, name: string) => void;
  onUpdateTechnical?: (id: string, field: TechField, value: string) => void;
  onRemove: (id: string) => void;
  canDelete: boolean;
  highlightIncomplete?: boolean;
}

const TECH_FIELDS: { key: TechField; label: string; placeholder: string }[] = [
  { key: "corpo", label: "Corpo (esp./cor)", placeholder: "15mm Branco" },
  { key: "porta", label: "Porta (esp./cor)", placeholder: "18mm Grafite" },
  { key: "puxador", label: "Puxador", placeholder: "Modelo / Cor" },
  { key: "complemento", label: "Complemento", placeholder: "Dobradiças, corrediças..." },
  { key: "modelo", label: "Modelo", placeholder: "Linha / Coleção" },
  { key: "fornecedor", label: "Fornecedor", placeholder: "Fabricante" },
  { key: "prazo", label: "Prazo", placeholder: "30 dias / Sob consulta" },
];

const REQUIRED_TECH_KEYS: TechField[] = ["corpo", "porta", "puxador", "fornecedor"];

function TechBadge({ value, label, required }: { value?: string; label: string; required?: boolean }) {
  if (!value && !required) return null;
  const filled = !!value?.trim();
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[9px] font-normal gap-0.5 py-0 h-4",
        filled
          ? "border-emerald-500/50 bg-emerald-50/50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400"
          : "border-amber-500/50 bg-amber-50/50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400"
      )}
    >
      {filled ? <Check className="h-2.5 w-2.5" /> : <AlertCircle className="h-2.5 w-2.5" />}
      <span className="text-muted-foreground">{label}</span>{filled ? `: ${value}` : ""}
    </Badge>
  );
}

const hasTechData = (env: ImportedEnvironment) =>
  !!(env.corpo || env.porta || env.puxador || env.complemento || env.modelo || env.fornecedor);

const isIncomplete = (env: ImportedEnvironment) =>
  REQUIRED_TECH_KEYS.some(k => !env[k]?.trim());

const missingCount = (env: ImportedEnvironment) =>
  REQUIRED_TECH_KEYS.filter(k => !env[k]?.trim()).length;

/* ── Tech Templates (Supabase) ──────────────────────────────────── */

const LEGACY_TEMPLATES_STORAGE_KEY = "tech-field-templates";
const LEGACY_TEMPLATES_MIGRATED_KEY = "tech-field-templates-migrated-v1";

interface TechTemplate {
  id: string;
  name: string;
  values: Record<TechField, string>;
}

function useTechTemplates() {
  const [templates, setTemplates] = useState<TechTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  const mapRowsToTemplates = useCallback((rows: any[]) => rows.map(r => ({
    id: r.id,
    name: r.name,
    values: {
      corpo: r.corpo || "",
      porta: r.porta || "",
      puxador: r.puxador || "",
      complemento: r.complemento || "",
      modelo: r.modelo || "",
      fornecedor: r.fornecedor || "",
      prazo: r.prazo || "",
    },
  })), []);

  const migrateLegacyTemplates = useCallback(async () => {
    const tenantId = getTenantId();
    const alreadyMigrated = localStorage.getItem(LEGACY_TEMPLATES_MIGRATED_KEY);
    const raw = localStorage.getItem(LEGACY_TEMPLATES_STORAGE_KEY);
    if (!tenantId || alreadyMigrated || !raw) return false;

    try {
      const parsed = JSON.parse(raw) as Array<{ name?: string; values?: Partial<Record<TechField, string>> }>;
      const validTemplates = parsed.filter(t => t?.name && t?.values);
      if (validTemplates.length === 0) {
        localStorage.setItem(LEGACY_TEMPLATES_MIGRATED_KEY, "1");
        return false;
      }

      const { data: userData } = await supabase.auth.getUser();
      const payload = validTemplates.map((template) => ({
        tenant_id: tenantId,
        name: String(template.name).trim(),
        corpo: template.values?.corpo || "",
        porta: template.values?.porta || "",
        puxador: template.values?.puxador || "",
        complemento: template.values?.complemento || "",
        modelo: template.values?.modelo || "",
        fornecedor: template.values?.fornecedor || "",
        created_by: userData?.user?.id || null,
      }));

      const { error } = await supabase.from("tech_field_templates" as any).insert(payload as any);
      if (error) {
        console.warn("[TechTemplates] legacy migration error:", error);
        return false;
      }

      localStorage.setItem(LEGACY_TEMPLATES_MIGRATED_KEY, "1");
      localStorage.removeItem(LEGACY_TEMPLATES_STORAGE_KEY);
      toast.success(`${payload.length} template(s) legado(s) migrado(s)`);
      return true;
    } catch (error) {
      console.warn("[TechTemplates] legacy migration parse error:", error);
      return false;
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    const tenantId = getTenantId();
    if (!tenantId) return;
    setLoading(true);

    const runFetch = async () => {
      const { data, error } = await supabase
        .from("tech_field_templates" as any)
        .select("id, name, corpo, porta, puxador, complemento, modelo, fornecedor")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(20);
      return { data, error };
    };

    let { data, error } = await runFetch();
    if (!error && (!data || data.length === 0)) {
      const migrated = await migrateLegacyTemplates();
      if (migrated) ({ data, error } = await runFetch());
    }

    if (!error && data) {
      setTemplates(mapRowsToTemplates(data as any[]));
    } else if (error) {
      console.warn("[TechTemplates] fetch error:", error);
    }

    setLoading(false);
  }, [mapRowsToTemplates, migrateLegacyTemplates]);

  const saveTemplate = useCallback(async (name: string, values: Record<TechField, string>) => {
    const tenantId = getTenantId();
    if (!tenantId) return false;
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("tech_field_templates" as any).insert({
      tenant_id: tenantId,
      name,
      corpo: values.corpo,
      porta: values.porta,
      puxador: values.puxador,
      complemento: values.complemento,
      modelo: values.modelo,
      fornecedor: values.fornecedor,
      created_by: userData?.user?.id || null,
    } as any);
    if (error) { toast.error("Erro ao salvar template"); return false; }
    toast.success(`Template "${name}" salvo`);
    await fetchTemplates();
    return true;
  }, [fetchTemplates]);

  const deleteTemplate = useCallback(async (id: string) => {
    const { error } = await supabase.from("tech_field_templates" as any).delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir template"); return; }
    setTemplates(prev => prev.filter(t => t.id !== id));
  }, []);

  return { templates, loading, fetchTemplates, saveTemplate, deleteTemplate };
}

/* ── Batch Fill Panel ──────────────────────────────────────────── */

interface BatchFillProps {
  environments: ImportedEnvironment[];
  onUpdateTechnical?: (id: string, field: TechField, value: string) => void;
}

function BatchFillPanel({ environments, onUpdateTechnical }: BatchFillProps) {
  const [batchValues, setBatchValues] = useState<Record<TechField, string>>({
    corpo: "", porta: "", puxador: "", complemento: "", modelo: "", fornecedor: "", prazo: "",
  });
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [applied, setApplied] = useState(false);
  const { templates, loading: templatesLoading, fetchTemplates, saveTemplate, deleteTemplate } = useTechTemplates();
  const [templateName, setTemplateName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);

  // Fetch templates on first open of popover
  const handleOpenTemplateMenu = useCallback((open: boolean) => {
    setTemplateMenuOpen(open);
    if (open) fetchTemplates();
  }, [fetchTemplates]);

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

  const handleSaveTemplate = useCallback(async () => {
    const name = templateName.trim();
    if (!name || !hasAnyValue) return;
    await saveTemplate(name, batchValues);
    setTemplateName("");
    setShowSaveInput(false);
  }, [templateName, batchValues, hasAnyValue, saveTemplate]);

  const handleLoadTemplate = useCallback((template: TechTemplate) => {
    setBatchValues({ ...template.values });
    setTemplateMenuOpen(false);
    toast.success(`Template "${template.name}" carregado`);
  }, []);

  const handleDeleteTemplate = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteTemplate(id);
  }, [deleteTemplate]);

  return (
    <div className="border border-dashed border-primary/30 rounded-md p-3 bg-primary/5">
      <div className="flex items-center gap-1.5 mb-2">
        <Layers className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-semibold text-foreground">Preenchimento em Lote</span>
        <span className="text-[10px] text-muted-foreground ml-1">— preencha e aplique a todos os ambientes</span>
        <div className="ml-auto flex items-center gap-1">
          {/* Load template */}
          <Popover open={templateMenuOpen} onOpenChange={handleOpenTemplateMenu}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-1 text-muted-foreground">
                <FolderOpen className="h-3 w-3" />
                Templates{templates.length > 0 && ` (${templates.length})`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1" align="end">
              {templatesLoading ? (
                <div className="flex items-center justify-center py-3 gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">Carregando...</span>
                </div>
              ) : templates.length === 0 ? (
                <p className="text-[10px] text-muted-foreground text-center py-3">Nenhum template salvo</p>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  {templates.map(t => (
                    <button
                      key={t.id}
                      className="flex items-center justify-between w-full text-left px-2 py-1.5 rounded hover:bg-muted/50 group"
                      onClick={() => handleLoadTemplate(t)}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-[11px] font-medium truncate">{t.name}</span>
                        <span className="text-[9px] text-muted-foreground truncate">
                          {TECH_FIELDS.filter(f => t.values[f.key]?.trim()).map(f => f.label).join(", ") || "Vazio"}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 opacity-0 group-hover:opacity-100 text-destructive shrink-0"
                        onClick={(e) => handleDeleteTemplate(t.id, e)}
                      >
                        <X className="h-2.5 w-2.5" />
                      </Button>
                    </button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
          {/* Save template */}
          {hasAnyValue && !showSaveInput && (
            <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-1 text-muted-foreground" onClick={() => setShowSaveInput(true)}>
              <Save className="h-3 w-3" />
              Salvar
            </Button>
          )}
        </div>
      </div>

      {showSaveInput && (
        <div className="flex items-center gap-1.5 mb-2 bg-background/60 rounded px-2 py-1">
          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="h-5 text-[10px] flex-1"
            placeholder="Nome do template (ex: Cozinha Padrão)"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSaveTemplate()}
          />
          <Button size="sm" className="h-5 text-[9px] gap-0.5" disabled={!templateName.trim()} onClick={handleSaveTemplate}>
            <Check className="h-2.5 w-2.5" /> Salvar
          </Button>
          <Button variant="ghost" size="sm" className="h-5 text-[9px]" onClick={() => { setShowSaveInput(false); setTemplateName(""); }}>
            <X className="h-2.5 w-2.5" />
          </Button>
        </div>
      )}

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

/* ── Module Type Labels ─────────────────────────────────────────── */

const MODULE_TYPE_LABELS: Record<ModuleType, { label: string; color: string }> = {
  modulo: { label: "Módulo", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  porta: { label: "Porta", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
  frente: { label: "Frente", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
  gaveta: { label: "Gaveta", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  painel: { label: "Painel", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  acessorio: { label: "Acessório", color: "bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400" },
};

function ModulesPanel({ modules }: { modules: ParsedModule[] }) {
  const [expanded, setExpanded] = useState(false);
  const [showAccessories, setShowAccessories] = useState(false);

  const mainModules = modules.filter(m => m.type !== "acessorio");
  const accessories = modules.filter(m => m.type === "acessorio");
  const displayModules = expanded ? mainModules : mainModules.slice(0, 6);
  const mainTotal = mainModules.reduce((s, m) => s + m.totalPrice, 0);
  const accTotal = accessories.reduce((s, m) => s + m.totalPrice, 0);

  return (
    <div className="mt-3 border-t border-border/50 pt-2">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Package className="h-3 w-3 text-primary" />
          <span className="text-[10px] font-semibold text-foreground">
            Módulos Extraídos ({mainModules.length} itens + {accessories.length} acessórios)
          </span>
        </div>
        <span className="text-[10px] font-semibold text-primary tabular-nums">
          {formatCurrency(mainTotal + accTotal)}
        </span>
      </div>

      <div className="space-y-0.5">
        {displayModules.map((mod) => {
          const typeInfo = MODULE_TYPE_LABELS[mod.type];
          return (
            <div key={mod.id} className="flex items-center gap-2 text-[10px] py-0.5 px-1 rounded hover:bg-muted/40">
              <Badge variant="secondary" className={cn("text-[8px] px-1 py-0 h-3.5 shrink-0", typeInfo.color)}>
                {typeInfo.label}
              </Badge>
              <span className="truncate flex-1 text-foreground" title={mod.description}>
                {mod.description}
              </span>
              {mod.finish && (
                <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 shrink-0">{mod.finish}</Badge>
              )}
              <span className="text-muted-foreground shrink-0">×{mod.quantity}</span>
              <span className="tabular-nums text-right shrink-0 w-16 font-medium">{formatCurrency(mod.totalPrice)}</span>
            </div>
          );
        })}
      </div>

      {mainModules.length > 6 && (
        <Button variant="ghost" size="sm" className="h-5 text-[9px] mt-1 w-full text-muted-foreground" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Mostrar menos" : `Ver todos (${mainModules.length} itens)`}
        </Button>
      )}

      {accessories.length > 0 && (
        <div className="mt-1">
          <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-1 text-muted-foreground" onClick={() => setShowAccessories(!showAccessories)}>
            {showAccessories ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
            Acessórios ({accessories.length}) — {formatCurrency(accTotal)}
          </Button>
          {showAccessories && (
            <div className="space-y-0.5 ml-2">
              {accessories.map((mod) => (
                <div key={mod.id} className="flex items-center gap-2 text-[10px] py-0.5 px-1 rounded hover:bg-muted/40">
                  <span className="truncate flex-1 text-muted-foreground" title={mod.description}>{mod.description}</span>
                  <span className="text-muted-foreground shrink-0">×{mod.quantity}</span>
                  <span className="tabular-nums text-right shrink-0 w-16">{formatCurrency(mod.totalPrice)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main Table ────────────────────────────────────────────────── */

export function SimulatorEnvironmentsTable({ environments, onUpdateName, onUpdateTechnical, onRemove, canDelete, highlightIncomplete }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [autoExpandedIds] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);

  // Auto-expand incomplete environments when highlight is triggered
  useEffect(() => {
    if (!highlightIncomplete) return;
    setExpandedIds(prev => {
      const next = new Set(prev);
      let changed = false;
      for (const env of environments) {
        if (isIncomplete(env) && !next.has(env.id)) {
          next.add(env.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [highlightIncomplete, environments]);

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
            <TableHead className="text-xs py-1.5 h-auto">Descrição / Ambiente</TableHead>
            <TableHead className="text-xs py-1.5 h-auto text-center">Qtd</TableHead>
            <TableHead className="text-xs py-1.5 h-auto">Fornecedor</TableHead>
            <TableHead className="text-xs py-1.5 h-auto">Prazo</TableHead>
            <TableHead className="text-xs py-1.5 h-auto text-right">Valor Ambiente</TableHead>
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
                <TableRow key={env.id} className={cn(
                  "text-xs",
                  incomplete && "border-l-2 border-l-amber-500",
                  incomplete && highlightIncomplete && "animate-pulse bg-amber-50/50 dark:bg-amber-950/20"
                )}>
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
                      {!isExpanded && (
                        <div className="flex flex-wrap gap-0.5">
                          <TechBadge value={env.corpo} label="C" required />
                          <TechBadge value={env.porta} label="P" required />
                          <TechBadge value={env.puxador} label="Pux" required />
                          <TechBadge value={env.fornecedor} label="Forn" required />
                          {env.complemento && <TechBadge value={env.complemento} label="Comp" />}
                          {env.modelo && <TechBadge value={env.modelo} label="Mod" />}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-1.5 text-center">{env.pieceCount || "—"}</TableCell>
                  <TableCell className="py-1.5">
                    <Input
                      value={env.fornecedor || ""}
                      onChange={(e) => onUpdateTechnical?.(env.id, "fornecedor", e.target.value)}
                      className="h-6 text-[11px] bg-transparent border-none p-0 focus-visible:ring-1 focus-visible:ring-primary/50"
                      placeholder="Selecionar..."
                      readOnly={!onUpdateTechnical}
                    />
                  </TableCell>
                  <TableCell className="py-1.5">
                    <Input
                      value={env.prazo || ""}
                      onChange={(e) => onUpdateTechnical?.(env.id, "prazo", e.target.value)}
                      className="h-6 text-[11px] bg-transparent border-none p-0 focus-visible:ring-1 focus-visible:ring-primary/50"
                      placeholder="Selecionar..."
                      readOnly={!onUpdateTechnical}
                    />
                  </TableCell>
                  <TableCell className="py-1.5 text-right tabular-nums">{formatCurrency(env.totalValue)}</TableCell>
                  <TableCell className="py-1.5 text-center">
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:text-destructive" onClick={() => onRemove(env.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>

                {isExpanded && (
                  <TableRow key={`${env.id}-tech`} className="bg-muted/20 hover:bg-muted/30">
                    <TableCell colSpan={7} className="py-2 px-3">
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
                                className={cn("h-6 text-[11px] bg-background", isEmpty && isRequired && "border-amber-500/50 focus-visible:ring-amber-500/30", isEmpty && isRequired && highlightIncomplete && "ring-2 ring-amber-500/60 animate-pulse")}
                                placeholder={placeholder}
                                readOnly={!onUpdateTechnical}
                              />
                            </div>
                          );
                        })}
                      </div>

                      {/* Modules list */}
                      {env.modules && env.modules.length > 0 && (
                        <ModulesPanel modules={env.modules} />
                      )}
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
