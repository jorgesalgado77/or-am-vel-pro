import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CheckCircle2,
  AlertTriangle,
  Eye,
  Code,
  FileText,
  Sparkles,
  Save,
  X,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { removeHighlights } from "@/lib/contractImport";
import { EditorToolbar } from "./EditorToolbar";
import { buildContractDocumentHtml } from "@/lib/contractDocument";
import type { ImportedContractContent } from "@/lib/contractImport";

interface DetectedVariable {
  variable: string;
  label: string;
  originalValue: string;
}

interface PdfImportPreviewModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: {
    nome: string;
    html: string;
    structure?: any;
    templateType?: string;
    fileName: string;
  }) => void;
  imported: ImportedContractContent;
  processedHtml: string;
  replacements: DetectedVariable[];
  replacedCount: number;
  fileName: string;
  saving?: boolean;
}

const ALL_VARIABLES = [
  { var: "{{nome_cliente}}", desc: "Nome do cliente", group: "Cliente" },
  { var: "{{cpf_cliente}}", desc: "CPF/CNPJ do cliente", group: "Cliente" },
  { var: "{{rg_insc_estadual}}", desc: "RG / Insc. Estadual", group: "Cliente" },
  { var: "{{telefone_cliente}}", desc: "Telefone do cliente", group: "Cliente" },
  { var: "{{email_cliente}}", desc: "Email do cliente", group: "Cliente" },
  { var: "{{data_nascimento}}", desc: "Data de nascimento", group: "Cliente" },
  { var: "{{profissao}}", desc: "Profissão do cliente", group: "Cliente" },
  { var: "{{endereco}}", desc: "Endereço do cliente", group: "Endereço" },
  { var: "{{bairro}}", desc: "Bairro do cliente", group: "Endereço" },
  { var: "{{cidade}}", desc: "Cidade do cliente", group: "Endereço" },
  { var: "{{uf}}", desc: "UF do cliente", group: "Endereço" },
  { var: "{{cep}}", desc: "CEP do cliente", group: "Endereço" },
  { var: "{{endereco_entrega}}", desc: "Endereço de entrega", group: "Endereço" },
  { var: "{{bairro_entrega}}", desc: "Bairro de entrega", group: "Endereço" },
  { var: "{{cidade_entrega}}", desc: "Cidade de entrega", group: "Endereço" },
  { var: "{{uf_entrega}}", desc: "UF de entrega", group: "Endereço" },
  { var: "{{cep_entrega}}", desc: "CEP de entrega", group: "Endereço" },
  { var: "{{numero_orcamento}}", desc: "Nº do orçamento", group: "Contrato" },
  { var: "{{numero_contrato}}", desc: "Nº do contrato", group: "Contrato" },
  { var: "{{data_fechamento}}", desc: "Data de fechamento", group: "Contrato" },
  { var: "{{data_atual}}", desc: "Data atual", group: "Contrato" },
  { var: "{{responsavel_venda}}", desc: "Responsável pela venda", group: "Contrato" },
  { var: "{{projetista}}", desc: "Projetista responsável", group: "Contrato" },
  { var: "{{observacoes}}", desc: "Observações do contrato", group: "Contrato" },
  { var: "{{garantia}}", desc: "Texto de garantia", group: "Contrato" },
  { var: "{{prazo_garantia}}", desc: "Prazo de garantia", group: "Contrato" },
  { var: "{{validade_proposta}}", desc: "Validade da proposta", group: "Contrato" },
  { var: "{{valor_tela}}", desc: "Valor de tela", group: "Financeiro" },
  { var: "{{valor_final}}", desc: "Valor final", group: "Financeiro" },
  { var: "{{valor_entrada}}", desc: "Valor da entrada", group: "Financeiro" },
  { var: "{{parcelas}}", desc: "Número de parcelas", group: "Financeiro" },
  { var: "{{valor_parcela}}", desc: "Valor da parcela", group: "Financeiro" },
  { var: "{{forma_pagamento}}", desc: "Forma de pagamento", group: "Financeiro" },
  { var: "{{percentual_desconto}}", desc: "Percentual de desconto", group: "Financeiro" },
  { var: "{{valor_com_desconto}}", desc: "Valor com desconto", group: "Financeiro" },
  { var: "{{valor_desconto}}", desc: "Valor do desconto em R$", group: "Financeiro" },
  { var: "{{valor_restante}}", desc: "Valor restante", group: "Financeiro" },
  { var: "{{condicoes_pagamento}}", desc: "Condições de pagamento", group: "Financeiro" },
  { var: "{{valor_por_extenso}}", desc: "Valor por extenso", group: "Financeiro" },
  { var: "{{prazo_entrega}}", desc: "Prazo de entrega", group: "Entrega" },
  { var: "{{prazo_entrega_fornecedor}}", desc: "Prazo do fornecedor", group: "Entrega" },
  { var: "{{data_entrega_prevista}}", desc: "Data prevista de entrega", group: "Entrega" },
  { var: "{{empresa_nome}}", desc: "Nome da empresa/loja", group: "Empresa" },
  { var: "{{cnpj_loja}}", desc: "CNPJ da loja", group: "Empresa" },
  { var: "{{endereco_loja}}", desc: "Endereço da loja", group: "Empresa" },
  { var: "{{telefone_loja}}", desc: "Telefone da loja", group: "Empresa" },
  { var: "{{email_loja}}", desc: "Email da loja", group: "Empresa" },
  { var: "{{itens_tabela}}", desc: "Tabela de itens/ambientes", group: "Tabelas" },
  { var: "{{itens_detalhes}}", desc: "Detalhes dos itens", group: "Tabelas" },
  { var: "{{ambientes_detalhes_completos}}", desc: "Tabela completa de ambientes", group: "Tabelas" },
  { var: "{{ambientes_prazos}}", desc: "Ambientes + prazos + fornecedores", group: "Tabelas" },
  { var: "{{produtos_catalogo}}", desc: "Produtos do catálogo", group: "Tabelas" },
  { var: "{{quantidade_ambientes}}", desc: "Nº total de ambientes", group: "Tabelas" },
  { var: "{{indicador_nome}}", desc: "Nome do indicador", group: "Outros" },
  { var: "{{indicador_comissao}}", desc: "Comissão do indicador", group: "Outros" },
];

const KNOWN_VARIABLES = ALL_VARIABLES.map(v => v.var);

export function PdfImportPreviewModal({
  open,
  onClose,
  onConfirm,
  imported,
  processedHtml,
  replacements,
  replacedCount,
  fileName,
  saving = false,
}: PdfImportPreviewModalProps) {
  const [templateName, setTemplateName] = useState(
    imported.suggestedName || fileName.replace(/\.(pdf|docx)$/i, "")
  );
  const [viewMode, setViewMode] = useState<"preview" | "variables" | "html">("preview");
  const [useAutoReplace, setUseAutoReplace] = useState(true);
  const [editedHtml, setEditedHtml] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [varSearch, setVarSearch] = useState("");

  const insertVariableAtCursor = useCallback((variable: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(variable));
      range.collapse(false);
    } else {
      editorRef.current.innerHTML += variable;
    }
    setEditedHtml(editorRef.current.innerHTML);
  }, []);

  const baseHtml = useAutoReplace ? processedHtml : imported.html;
  const finalHtml = editedHtml !== null ? editedHtml : baseHtml;

  // Capture editor content when switching away from editor tab
  const captureEditorContent = useCallback(() => {
    if (editorRef.current) {
      setEditedHtml(editorRef.current.innerHTML);
    }
  }, []);

  // Sync editedHtml when toggling auto-replace
  const handleAutoReplaceChange = (val: boolean) => {
    setUseAutoReplace(val);
    setEditedHtml(null);
    setEditorKey((k) => k + 1);
  };

  const handleViewChange = (mode: "preview" | "variables" | "html") => {
    if (viewMode === "html") captureEditorContent();
    setViewMode(mode);
  };

  const variableSummary = useMemo(() => {
    const html = removeHighlights(finalHtml);
    const matches = html.match(/\{\{[^}]+\}\}/g) || [];
    const usedSet = new Set(matches);
    const knownSet = new Set(KNOWN_VARIABLES);
    const used = [...usedSet].filter((v) => knownSet.has(v));
    const unknown = [...usedSet].filter((v) => !knownSet.has(v));
    return { used, unknown, total: usedSet.size };
  }, [finalHtml]);

  // Highlight {{...}} variables with green (known) or red (unknown)
  const highlightVariablesInHtml = (html: string): string => {
    const knownSet = new Set(KNOWN_VARIABLES);
    return html.replace(/(\{\{[^}]+\}\})/g, (match) => {
      const isKnown = knownSet.has(match);
      if (isKnown) {
        return `<span style="background: linear-gradient(135deg, hsl(142 60% 85%), hsl(142 60% 75%)); padding: 2px 6px; border-radius: 4px; border: 1px dashed hsl(142 70% 40%); font-family: monospace; font-size: 0.85em; font-weight: 600; color: hsl(142 70% 25%); white-space: nowrap;" title="✓ Variável reconhecida">${match}</span>`;
      }
      return `<span style="background: linear-gradient(135deg, hsl(0 70% 90%), hsl(0 70% 82%)); padding: 2px 6px; border-radius: 4px; border: 1px dashed hsl(0 70% 50%); font-family: monospace; font-size: 0.85em; font-weight: 600; color: hsl(0 70% 30%); white-space: nowrap;" title="⚠ Variável desconhecida">${match}</span>`;
    });
  };

  const previewHtml = useMemo(() => {
    const baseDoc = buildContractDocumentHtml(removeHighlights(finalHtml), templateName || "Preview");
    return highlightVariablesInHtml(baseDoc);
  }, [finalHtml, templateName]);

  const handleConfirm = () => {
    if (viewMode === "html") captureEditorContent();
    const html = viewMode === "html" && editorRef.current
      ? editorRef.current.innerHTML
      : finalHtml;
    onConfirm({
      nome: templateName || "Template Importado",
      html,
      structure: imported.structure,
      templateType: imported.templateType,
      fileName,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl h-[90vh] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Preview da Importação
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-4 px-1 pb-2">
          {/* Template Name */}
          <div className="space-y-1">
            <Label className="text-xs font-medium">Nome do Template</Label>
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Nome do template"
              className="h-9"
            />
          </div>

          {/* Auto-replace toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Auto-detecção de variáveis</p>
                <p className="text-xs text-muted-foreground">
                  {replacedCount} campo(s) detectado(s) e convertido(s) em variáveis
                </p>
              </div>
            </div>
            <Switch checked={useAutoReplace} onCheckedChange={handleAutoReplaceChange} />
          </div>

          {/* Tab buttons */}
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <Button
              variant={viewMode === "preview" ? "default" : "ghost"}
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => handleViewChange("preview")}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </Button>
            <Button
              variant={viewMode === "variables" ? "default" : "ghost"}
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => handleViewChange("variables")}
            >
              <Code className="h-3.5 w-3.5" />
              Variáveis ({variableSummary.total})
            </Button>
            <Button
              variant={viewMode === "html" ? "default" : "ghost"}
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => handleViewChange("html")}
            >
              <Pencil className="h-3.5 w-3.5" />
              Editor Visual
            </Button>
          </div>

          {/* Content area */}
          <div className="rounded-lg border border-border min-h-[40vh]">
            {viewMode === "preview" ? (
              <div
                className="p-4 bg-background"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
                style={{ fontSize: "10px", transform: "scale(0.7)", transformOrigin: "top left", width: "142%" }}
              />
            ) : viewMode === "html" ? (
              <div className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <EditorToolbar editorRef={editorRef as React.RefObject<HTMLDivElement>} />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
                        <Plus className="h-3.5 w-3.5" />
                        Inserir variável
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="end">
                      <div className="p-2 border-b border-border">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            placeholder="Buscar variável..."
                            value={varSearch}
                            onChange={(e) => setVarSearch(e.target.value)}
                            className="h-8 pl-8 text-xs"
                          />
                        </div>
                      </div>
                      <ScrollArea className="h-64">
                        <div className="p-1">
                          {(() => {
                            const filtered = ALL_VARIABLES.filter(
                              (v) =>
                                v.var.toLowerCase().includes(varSearch.toLowerCase()) ||
                                v.desc.toLowerCase().includes(varSearch.toLowerCase())
                            );
                            const groups = [...new Set(filtered.map((v) => v.group))];
                            return groups.map((group) => (
                              <div key={group} className="mb-1">
                                <p className="text-[10px] font-semibold text-muted-foreground px-2 py-1 uppercase tracking-wider">
                                  {group}
                                </p>
                                {filtered
                                  .filter((v) => v.group === group)
                                  .map((v) => (
                                    <button
                                      key={v.var}
                                      onClick={() => {
                                        insertVariableAtCursor(v.var);
                                        setVarSearch("");
                                      }}
                                      className="w-full text-left px-2 py-1.5 rounded-sm text-xs hover:bg-accent flex items-center justify-between gap-2"
                                    >
                                      <span className="font-mono text-primary truncate">{v.var}</span>
                                      <span className="text-muted-foreground text-[10px] shrink-0">{v.desc}</span>
                                    </button>
                                  ))}
                              </div>
                            ));
                          })()}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                </div>
                <div
                  key={editorKey}
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  className="prose prose-sm min-h-[30vh] max-w-none rounded-b-lg border border-border bg-background p-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  dangerouslySetInnerHTML={{ __html: highlightVariablesInHtml(editedHtml !== null ? editedHtml : baseHtml) }}
                  onBlur={() => {
                    if (editorRef.current) setEditedHtml(editorRef.current.innerHTML);
                  }}
                />
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {useAutoReplace && replacements.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Campos detectados e substituídos
                    </h4>
                    <div className="space-y-1.5">
                      {replacements.map((r, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-2 text-sm"
                        >
                          <Badge variant="secondary" className="text-xs font-mono shrink-0">
                            {r.variable}
                          </Badge>
                          <span className="text-muted-foreground">←</span>
                          <span className="text-xs text-muted-foreground truncate">
                            {r.label}: <span className="text-foreground">{r.originalValue}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Resumo de variáveis no template</h4>

                  {variableSummary.used.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Variáveis reconhecidas ({variableSummary.used.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {variableSummary.used.map((v) => (
                          <Badge key={v} variant="outline" className="text-xs font-mono text-green-700 border-green-300">
                            {v}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {variableSummary.unknown.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                        Variáveis desconhecidas ({variableSummary.unknown.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {variableSummary.unknown.map((v) => (
                          <Badge key={v} variant="outline" className="text-xs font-mono text-amber-700 border-amber-300">
                            {v}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {variableSummary.total === 0 && (
                    <p className="text-sm text-muted-foreground py-2">
                      Nenhuma variável encontrada no template.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            <X className="h-4 w-4 mr-1" />
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={saving || !templateName.trim()}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? "Salvando..." : "Importar Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
