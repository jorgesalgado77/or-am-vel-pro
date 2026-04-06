import {useState, useRef, useEffect, useMemo, useCallback} from "react";
import {Dialog, DialogContent, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Printer, Eye, Code, Lock, LockOpen, Save, Download, Send, Copy, Check, Wand2, Undo2, X, ChevronDown, ChevronUp, Move} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {buildContractDocumentHtml, openContractPrintWindow} from "@/lib/contractDocument";
import {supabase} from "@/lib/supabaseClient";
import {generateContractPdfServerSide, openOrSharePdf} from "@/lib/pdfService";
import {toast} from "sonner";
import {replaceDetectedFieldsWithPlaceholders, type FieldReplacement} from "@/lib/contractImport";
import {ScrollArea} from "@/components/ui/scroll-area";
import {injectDragVariablesIntoHtml, applyVariablePositions, type VariablePosition} from "@/lib/contractDragVariables";

interface ContractEditorDialogProps {
  open: boolean;
  onClose: () => void;
  initialHtml: string;
  clientName: string;
  onSave: (finalHtml: string) => Promise<string | null>;
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
  const [fieldReplacements, setFieldReplacements] = useState<FieldReplacement[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [dragMode, setDragMode] = useState(false);
  const [varPositions, setVarPositions] = useState<VariablePosition[]>([]);
  const editorRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setHtml(initialHtml);
    setViewMode("preview");
    setLayoutLocked(true);
    setContractId(externalContractId || null);
    setLinkCopied(false);
    setFieldReplacements([]);
    setShowSummary(false);
    setDragMode(false);
    setVarPositions([]);
  }, [initialHtml, externalContractId]);

  // Listen for position changes from iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'variable-position-change') {
        const pos = e.data as VariablePosition & { type: string };
        setVarPositions((prev) => {
          const idx = prev.findIndex((p) => p.idx === pos.idx);
          const updated = { idx: pos.idx, varText: pos.varText, left: pos.left, top: pos.top, width: pos.width, height: pos.height };
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = updated;
            return next;
          }
          return [...prev, updated];
        });
      } else if (e.data?.type === 'all-variable-positions') {
        setVarPositions(e.data.positions);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    if (viewMode === "editor" && editorRef.current) {
      if (layoutLocked) applyLayoutLock(editorRef.current);
      highlightPlaceholders(editorRef.current);
    }
  }, [viewMode, layoutLocked, html]);

  const getCurrentHtml = () => {
    if (viewMode === "editor" && editorRef.current) return editorRef.current.innerHTML;
    return html;
  };

  const previewDocument = useMemo(() => {
    const base = buildContractDocumentHtml(html, `Contrato - ${clientName}`);
    return dragMode ? injectDragVariablesIntoHtml(base) : base;
  }, [html, clientName, dragMode]);

  const handleToggleDragMode = () => {
    if (dragMode && varPositions.length > 0) {
      // Apply positions into HTML when exiting drag mode
      setHtml((prev) => applyVariablePositions(prev, varPositions));
      setVarPositions([]);
      toast.success("Posições das variáveis aplicadas!");
    }
    setDragMode(!dragMode);
  };

  const handleToggleView = () => {
    if (viewMode === "editor" && editorRef.current) setHtml(editorRef.current.innerHTML);
    setViewMode(viewMode === "editor" ? "preview" : "editor");
  };

  const handleAutoVariables = () => {
    const currentHtml = getCurrentHtml();
    const result = replaceDetectedFieldsWithPlaceholders(currentHtml);
    if (result.replacedCount === 0) {
      toast.info("Nenhum campo detectado para conversão");
      return;
    }
    setHtml(result.html);
    if (viewMode === "editor" && editorRef.current) {
      editorRef.current.innerHTML = result.html;
    }
    setFieldReplacements(result.replacements);
    setShowSummary(true);
    toast.success(`${result.replacedCount} campo(s) convertido(s) em variáveis {{...}}`);
  };

  const handleUndoReplacement = (replacement: FieldReplacement) => {
    const currentHtml = getCurrentHtml();
    // Replace the variable back with the original value
    const updatedHtml = currentHtml.replace(replacement.variable, replacement.originalValue);
    if (updatedHtml !== currentHtml) {
      setHtml(updatedHtml);
      if (viewMode === "editor" && editorRef.current) {
        editorRef.current.innerHTML = updatedHtml;
      }
      setFieldReplacements((prev) => prev.filter((r) => r.id !== replacement.id));
      toast.info(`Restaurado: "${replacement.label}" → valor original`);
    }
  };

  const handleUndoAll = () => {
    let currentHtml = getCurrentHtml();
    for (const r of fieldReplacements) {
      currentHtml = currentHtml.replace(r.variable, r.originalValue);
    }
    setHtml(currentHtml);
    if (viewMode === "editor" && editorRef.current) {
      editorRef.current.innerHTML = currentHtml;
    }
    setFieldReplacements([]);
    setShowSummary(false);
    toast.info("Todas as substituições foram desfeitas");
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
        setFieldReplacements([]);
        setShowSummary(false);
        toast.success("Contrato salvo com sucesso!");
      }
    } finally {
      setLocalSaving(false);
    }
  };

  const handlePrint = () => {
    openContractPrintWindow(getCurrentHtml(), `Contrato - ${clientName}`);
  };

  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (!tenantId) {
      // Fallback to print dialog if no tenant
      openContractPrintWindow(getCurrentHtml(), `Contrato - ${clientName}`);
      toast.info("Na janela de impressão, selecione 'Salvar como PDF'");
      return;
    }
    setDownloadingPdf(true);
    try {
      const currentHtml = getCurrentHtml();
      const title = `Contrato - ${clientName}`;
      const result = await generateContractPdfServerSide(tenantId, currentHtml, title);
      if (!result.success || !result.download_url) {
        toast.error(result.error || "Erro ao gerar PDF do contrato");
        return;
      }
      toast.success("PDF do contrato gerado!");
      await openOrSharePdf(result.download_url, `contrato-${clientName.replace(/\s+/g, "_")}.pdf`);
    } catch {
      toast.error("Erro ao gerar PDF do contrato");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleSendToClient = async () => {
    setSendingToClient(true);
    try {
      const currentHtml = getCurrentHtml();
      let id = contractId;
      if (!id) {
        id = await onSave(currentHtml);
        if (!id) { toast.error("Salve o contrato antes de enviar"); return; }
        setContractId(id);
      } else {
        await supabase.from("client_contracts").update({ conteudo_html: currentHtml } as any).eq("id", id);
      }
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

  const isBusy = saving || localSaving || sendingToClient || downloadingPdf;

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

          {viewMode === "preview" && (
            <Button
              variant={dragMode ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={handleToggleDragMode}
            >
              <Move className="h-3.5 w-3.5" />
              {dragMode ? "Aplicar Posições" : "Mover Variáveis"}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleAutoVariables}
            disabled={isBusy}
          >
            <Wand2 className="h-3.5 w-3.5" /> Auto-variáveis
          </Button>

          {fieldReplacements.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setShowSummary(!showSummary)}
            >
              <Badge variant="secondary" className="text-[10px] px-1.5">
                {fieldReplacements.length}
              </Badge>
              {showSummary ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Conversões
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

        {/* Replacements Summary Panel */}
        {showSummary && fieldReplacements.length > 0 && (
          <div className="mb-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Wand2 className="h-3.5 w-3.5 text-primary" />
                Campos convertidos ({fieldReplacements.length})
              </h4>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-destructive hover:text-destructive" onClick={handleUndoAll}>
                  <Undo2 className="h-3 w-3" /> Desfazer tudo
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowSummary(false)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <ScrollArea className="max-h-[140px]">
              <div className="space-y-1">
                {fieldReplacements.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-[11px] bg-background/60 hover:bg-background transition-colors group">
                    <Badge variant="outline" className="text-[10px] shrink-0 border-primary/30 text-primary font-mono">
                      {r.variable}
                    </Badge>
                    <span className="text-muted-foreground">←</span>
                    <span className="truncate text-muted-foreground flex-1" title={r.originalValue}>
                      {r.originalValue.length > 40 ? r.originalValue.slice(0, 40) + "…" : r.originalValue}
                    </span>
                    <Badge variant="secondary" className="text-[9px] shrink-0">{r.label}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={() => handleUndoReplacement(r)}
                      title="Desfazer esta substituição"
                    >
                      <Undo2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

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
              ref={iframeRef}
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

function highlightPlaceholders(container: HTMLElement) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const placeholderRegex = /(\{\{[^}]+\}\})/g;
  const nodesToReplace: { node: Text; frag: DocumentFragment }[] = [];

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    if (!placeholderRegex.test(textNode.textContent || "")) continue;
    // Skip if already inside a highlight mark
    if (textNode.parentElement?.closest("[data-placeholder-highlight]")) continue;

    const frag = document.createDocumentFragment();
    const parts = textNode.textContent!.split(placeholderRegex);
    for (const part of parts) {
      if (placeholderRegex.test(part)) {
        const mark = document.createElement("mark");
        mark.setAttribute("data-placeholder-highlight", "true");
        mark.style.cssText =
          "background: hsl(var(--primary) / 0.15); color: hsl(var(--primary)); border: 1px dashed hsl(var(--primary) / 0.4); border-radius: 4px; padding: 1px 4px; font-family: monospace; font-size: 0.9em;";
        mark.textContent = part;
        frag.appendChild(mark);
      } else if (part) {
        frag.appendChild(document.createTextNode(part));
      }
    }
    placeholderRegex.lastIndex = 0;
    nodesToReplace.push({ node: textNode, frag });
  }

  for (const { node, frag } of nodesToReplace) {
    node.parentNode?.replaceChild(frag, node);
  }
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

