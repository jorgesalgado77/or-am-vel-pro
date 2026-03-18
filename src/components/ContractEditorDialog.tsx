import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Save, Eye, Code } from "lucide-react";

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

  // Reset html when initialHtml changes (opening a different contract)
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
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Contrato — {clientName}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-2">
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
            {viewMode === "editor" ? "Edite o texto livremente" : "Pré-visualização do contrato"}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto border border-border rounded-lg">
          {viewMode === "editor" ? (
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="min-h-[400px] p-6 bg-background text-foreground text-sm focus:outline-none prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <div className="min-h-[400px] p-6 bg-white text-black">
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
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
