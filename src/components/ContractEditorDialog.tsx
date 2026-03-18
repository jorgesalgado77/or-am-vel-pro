import { useState, useRef, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Save, Eye, Code } from "lucide-react";
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
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHtml(initialHtml);
    setViewMode("preview");
  }, [initialHtml]);

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
          <span className="text-xs text-muted-foreground">
            {viewMode === "editor" ? "Edite o HTML livremente" : "Preview fiel ao documento impresso"}
          </span>
        </div>

        <div className="flex-1 overflow-hidden rounded-lg border border-border">
          {viewMode === "editor" ? (
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="prose prose-sm min-h-[400px] max-w-none overflow-y-auto bg-background p-6 text-sm text-foreground focus:outline-none"
              dangerouslySetInnerHTML={{ __html: html }}
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
