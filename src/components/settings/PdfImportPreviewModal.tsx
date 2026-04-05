import { useState, useMemo } from "react";
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
  CheckCircle2,
  AlertTriangle,
  Eye,
  Code,
  FileText,
  Sparkles,
  Save,
  X,
  Pencil,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { removeHighlights } from "@/lib/contractImport";
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

const KNOWN_VARIABLES = [
  "{{nome_cliente}}", "{{cpf_cliente}}", "{{rg_insc_estadual}}", "{{endereco}}",
  "{{bairro}}", "{{cidade}}", "{{cep}}", "{{telefone_cliente}}", "{{email_cliente}}",
  "{{profissao}}", "{{data_nascimento}}", "{{data_atual}}", "{{valor_final}}",
  "{{valor_entrada}}", "{{parcelas}}", "{{valor_parcela}}", "{{forma_pagamento}}",
  "{{prazo_entrega}}", "{{projetista}}", "{{numero_contrato}}", "{{garantia}}",
  "{{nome_empresa}}", "{{cnpj_empresa}}", "{{endereco_empresa}}", "{{telefone_empresa}}",
];

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

  const baseHtml = useAutoReplace ? processedHtml : imported.html;
  const finalHtml = editedHtml !== null ? editedHtml : baseHtml;

  // Sync editedHtml when toggling auto-replace
  const handleAutoReplaceChange = (val: boolean) => {
    setUseAutoReplace(val);
    setEditedHtml(null);
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

  const previewHtml = useMemo(
    () => buildContractDocumentHtml(removeHighlights(finalHtml), templateName || "Preview"),
    [finalHtml, templateName]
  );

  const handleConfirm = () => {
    onConfirm({
      nome: templateName || "Template Importado",
      html: finalHtml,
      structure: imported.structure,
      templateType: imported.templateType,
      fileName,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Preview da Importação
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
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
              onClick={() => setViewMode("preview")}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </Button>
            <Button
              variant={viewMode === "variables" ? "default" : "ghost"}
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => setViewMode("variables")}
            >
              <Code className="h-3.5 w-3.5" />
              Variáveis ({variableSummary.total})
            </Button>
            <Button
              variant={viewMode === "html" ? "default" : "ghost"}
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => setViewMode("html")}
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar HTML
            </Button>
          </div>

          {/* Content area */}
          <ScrollArea className="flex-1 min-h-0 max-h-[45vh] rounded-lg border border-border">
            {viewMode === "preview" ? (
              <div
                className="p-4 bg-background"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
                style={{ fontSize: "10px", transform: "scale(0.7)", transformOrigin: "top left", width: "142%" }}
              />
            ) : (
              <div className="p-4 space-y-4">
                {/* Detected replacements */}
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

                {/* Variable summary */}
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
            ) : viewMode === "html" ? (
              <div className="p-2">
                <Textarea
                  value={editedHtml !== null ? editedHtml : baseHtml}
                  onChange={(e) => setEditedHtml(e.target.value)}
                  className="min-h-[40vh] font-mono text-xs leading-relaxed resize-none"
                  placeholder="HTML do template..."
                />
              </div>
            ) : null}
          </ScrollArea>
        </div>

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
