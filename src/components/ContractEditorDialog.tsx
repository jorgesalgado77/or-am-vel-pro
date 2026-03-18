import { useState, useRef, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Save, Eye, Code, Lock, LockOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buildContractDocumentHtml } from "@/lib/contractDocument";

interface ContractEditorDialogProps {
  open: boolean;
  onClose: () => void;
  initialHtml: string;
  clientName: string;
  onConfirm: (finalHtml: string) => void;
  saving?: boolean;
}

export function ContractEditorDialog({ open, onClose, initialHtml, clientName, onConfirm, saving }: ContractEditorDialogProps) {
  const [html, setHtml] = useState(initialHtml);
  const [viewMode, setViewMode] = useState<"editor" | "preview">("preview");
  const [layoutLocked, setLayoutLocked] = useState(true);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHtml(initialHtml);
    setViewMode("preview");
    setLayoutLocked(true);
  }, [initialHtml]);

  // Apply layout lock: make structural elements non-editable
  useEffect(() => {
    if (viewMode === "editor" && editorRef.current && layoutLocked) {
      applyLayoutLock(editorRef.current);
    }
  }, [viewMode, layoutLocked]);

  const getCurrentHtml = () => {
    if (viewMode === "editor" && editorRef.current) {
      return editorRef.current.innerHTML;
    }
    return html;
  };

  const previewDocument = useMemo(
    () => buildContractDocumentHtml(html, `Contrato - ${clientName}`),
    [html, clientName],
  );

  const handleToggleView = () => {
    if (viewMode === "editor" && editorRef.current) {
      setHtml(editorRef.current.innerHTML);
    }
    setViewMode(viewMode === "editor" ? "preview" : "editor");
  };

  const handleConfirm = () => {
    onConfirm(getCurrentHtml());
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-7xl flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Contrato — {clientName}</DialogTitle>
        </DialogHeader>

        <div className="mb-2 flex items-center gap-2">
          <Button
            variant={viewMode === "preview" ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={handleToggleView}
          >
            {viewMode === "preview" ? <Code className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {viewMode === "preview" ? "Editar" : "Visualizar"}
          </Button>

          {viewMode === "editor" && (
            <Button
              variant={layoutLocked ? "secondary" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => setLayoutLocked(!layoutLocked)}
            >
              {layoutLocked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
              {layoutLocked ? "Layout Bloqueado" : "Layout Livre"}
            </Button>
          )}

          <span className="text-xs text-muted-foreground">
            {viewMode === "editor"
              ? layoutLocked
                ? "Apenas textos editáveis — estrutura protegida"
                : "Edição livre do HTML (cuidado com a estrutura)"
              : "Preview fiel ao documento impresso"}
          </span>

          {layoutLocked && viewMode === "editor" && (
            <Badge variant="outline" className="ml-auto text-[10px] border-amber-500/50 text-amber-700">
              <Lock className="h-3 w-3 mr-1" /> Estrutura protegida
            </Badge>
          )}
        </div>

        <div className="flex-1 overflow-hidden rounded-lg border border-border">
          {viewMode === "editor" ? (
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="prose prose-sm min-h-[400px] max-w-none overflow-y-auto bg-background p-6 text-sm text-foreground focus:outline-none"
              dangerouslySetInnerHTML={{ __html: html }}
              onKeyDown={(e) => {
                if (layoutLocked) {
                  // Prevent structural keys when layout is locked
                  if (e.key === "Enter" && (e.ctrlKey || e.shiftKey)) {
                    e.preventDefault();
                  }
                  // Block paste of HTML that might break structure
                  if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    navigator.clipboard.readText().then((text) => {
                      document.execCommand("insertText", false, text);
                    });
                  }
                }
              }}
            />
          ) : (
            <iframe
              title={`Preview do contrato de ${clientName}`}
              className="h-[70vh] w-full bg-muted/20"
              srcDoc={previewDocument}
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={saving} className="gap-2">
            <Printer className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar e Imprimir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Makes structural elements (tables, sections, divs with positioning) non-editable
 * while keeping text content editable.
 */
function applyLayoutLock(container: HTMLElement) {
  // Structural elements that should be locked
  const structuralSelectors = [
    "table", "thead", "tbody", "tfoot", "tr",
    "section.contract-page",
    "[data-contract-page]",
    ".contract-page__content",
  ];

  structuralSelectors.forEach((selector) => {
    container.querySelectorAll(selector).forEach((el) => {
      (el as HTMLElement).setAttribute("contenteditable", "false");
    });
  });

  // But keep text containers editable
  const textSelectors = ["td", "th", "p", "span", "strong", "em", "h1", "h2", "h3", "h4", "h5", "h6", "li", "a", "div:not(.contract-page__content):not([data-contract-page])"];
  textSelectors.forEach((selector) => {
    container.querySelectorAll(selector).forEach((el) => {
      const htmlEl = el as HTMLElement;
      // Only make leaf-level divs/spans editable (those with text)
      if (selector.startsWith("div") && el.querySelector("table, section, [data-contract-page]")) return;
      if (htmlEl.closest("table") && !["td", "th"].includes(el.tagName.toLowerCase())) return;
      htmlEl.setAttribute("contenteditable", "true");
    });
  });
}
