import {useState, useRef, useEffect, useMemo} from "react";
import {Dialog, DialogContent, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Printer, Eye, Code, Lock, LockOpen, Save, Download, Send, Copy, Check, Wand2} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {buildContractDocumentHtml, openContractPrintWindow} from "@/lib/contractDocument";
import {supabase} from "@/lib/supabaseClient";
import {toast} from "sonner";
import {replaceDetectedFieldsWithPlaceholders} from "@/lib/contractImport";

interface ContractEditorDialogProps {
  open: boolean;
  onClose: () => void;
  initialHtml: string;
  clientName: string;
  onSave: (finalHtml: string) => Promise<string | null>; // returns contract ID
  saving?: boolean;
  contractId?: string | null;
  tenantId?: string | null;
}

export function ContractEditorDialog({ open, onClose, initialHtml, clientName, onSave, saving, contractId: externalContractId, tenantId }: ContractEditorDialogProps) {
  const [html, setHtml] = useState(initialHtml);
  const [viewMode, setViewMode] = useState<"editor" | "preview">("preview");
  const [layoutLocked, setLayoutLocked] = useState(true);
  const [localSaving, setLocalSaving] = useState(false);
  const [sendingToClient, setSendingToClient] = useState(false);
  const [contractId, setContractId] = useState<string | null>(externalContractId || null);
  const [linkCopied, setLinkCopied] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHtml(initialHtml);
    setViewMode("preview");
    setLayoutLocked(true);
    setContractId(externalContractId || null);
    setLinkCopied(false);
  }, [initialHtml, externalContractId]);

  useEffect(() => {
    if (viewMode === "editor" && editorRef.current && layoutLocked) {
      applyLayoutLock(editorRef.current);
    }
  }, [viewMode, layoutLocked]);

  const getCurrentHtml = () => {
    if (viewMode === "editor" && editorRef.current) return editorRef.current.innerHTML;
    return html;
  };

  const previewDocument = useMemo(
    () => buildContractDocumentHtml(html, `Contrato - ${clientName}`),
    [html, clientName],
  );

  const handleToggleView = () => {
    if (viewMode === "editor" && editorRef.current) setHtml(editorRef.current.innerHTML);
    setViewMode(viewMode === "editor" ? "preview" : "editor");
  };

  // Save contract
  const handleSaveContract = async () => {
    setLocalSaving(true);
    try {
      const currentHtml = getCurrentHtml();
      const savedId = await onSave(currentHtml);
      if (savedId) {
        setContractId(savedId);
        setHtml(currentHtml);
        toast.success("Contrato salvo com sucesso!");
      }
    } finally {
      setLocalSaving(false);
    }
  };

  // Print
  const handlePrint = () => {
    openContractPrintWindow(getCurrentHtml(), `Contrato - ${clientName}`);
  };

  // Download PDF (via print dialog)
  const handleDownloadPdf = () => {
    openContractPrintWindow(getCurrentHtml(), `Contrato - ${clientName}`);
    toast.info("Na janela de impressão, selecione 'Salvar como PDF'");
  };

  // Send to client area
  const handleSendToClient = async () => {
    setSendingToClient(true);
    try {
      const currentHtml = getCurrentHtml();
      // First save if not saved
      let id = contractId;
      if (!id) {
        id = await onSave(currentHtml);
        if (!id) { toast.error("Salve o contrato antes de enviar"); return; }
        setContractId(id);
      } else {
        // Update HTML
        await supabase.from("client_contracts").update({ conteudo_html: currentHtml } as any).eq("id", id);
      }

      // Generate public token
      const publicToken = crypto.randomUUID();
      const { error } = await supabase.from("client_contracts").update({
        public_token: publicToken,
        status: "enviado",
      } as any).eq("id", id);

      if (error) { toast.error("Erro ao gerar link público"); return; }

      const publicUrl = `${window.location.origin}/contrato/${publicToken}`;
      await navigator.clipboard.writeText(publicUrl);
      setLinkCopied(true);
      toast.success("Link copiado! Envie ao cliente para assinatura.", { duration: 8000 });
    } finally {
      setSendingToClient(false);
    }
  };

  const isBusy = saving || localSaving || sendingToClient;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-7xl flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Contrato — {clientName}</DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
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

          <span className="text-xs text-muted-foreground hidden sm:inline">
            {viewMode === "editor"
              ? layoutLocked ? "Apenas textos editáveis" : "Edição livre do HTML"
              : "Preview fiel ao documento impresso"}
          </span>

          {layoutLocked && viewMode === "editor" && (
            <Badge variant="outline" className="ml-auto text-[10px] border-amber-500/50 text-amber-700">
              <Lock className="h-3 w-3 mr-1" /> Estrutura protegida
            </Badge>
          )}
        </div>

        {/* Content */}
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
                  if (e.key === "Enter" && (e.ctrlKey || e.shiftKey)) e.preventDefault();
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

        {/* Action Bar */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isBusy}>
            Fechar
          </Button>

          <div className="flex-1" />

          <Button variant="outline" size="sm" onClick={handlePrint} disabled={isBusy} className="gap-1.5">
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </Button>

          <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={isBusy} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Baixar PDF
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSendToClient}
            disabled={isBusy}
            className="gap-1.5"
          >
            {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            {sendingToClient ? "Gerando..." : linkCopied ? "Link copiado!" : "Enviar ao Cliente"}
          </Button>

          <Button size="sm" onClick={handleSaveContract} disabled={isBusy} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {localSaving || saving ? "Salvando..." : "Salvar Contrato"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function applyLayoutLock(container: HTMLElement) {
  const structuralSelectors = [
    "table", "thead", "tbody", "tfoot", "tr",
    "section.contract-page", "[data-contract-page]", ".contract-page__content",
  ];
  structuralSelectors.forEach((selector) => {
    container.querySelectorAll(selector).forEach((el) => {
      (el as HTMLElement).setAttribute("contenteditable", "false");
    });
  });
  const textSelectors = ["td", "th", "p", "span", "strong", "em", "h1", "h2", "h3", "h4", "h5", "h6", "li", "a", "div:not(.contract-page__content):not([data-contract-page])"];
  textSelectors.forEach((selector) => {
    container.querySelectorAll(selector).forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (selector.startsWith("div") && el.querySelector("table, section, [data-contract-page]")) return;
      if (htmlEl.closest("table") && !["td", "th"].includes(el.tagName.toLowerCase())) return;
      htmlEl.setAttribute("contenteditable", "true");
    });
  });
}
