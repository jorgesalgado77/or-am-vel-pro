import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download, X, Loader2, MessageCircle, AlertTriangle } from "lucide-react";
import { useRef, useEffect, useState, useCallback } from "react";
import { toast } from "sonner";

interface PdfPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfUrl: string | null;
  loading?: boolean;
  clientId?: string | null;
}

export function PdfPreviewModal({ open, onOpenChange, pdfUrl, loading, clientId }: PdfPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [fetching, setFetching] = useState(false);

  // Convert signed URL to blob URL for iframe compatibility
  useEffect(() => {
    if (!pdfUrl || !open) {
      setBlobUrl(null);
      setFetchError(false);
      return;
    }

    let cancelled = false;
    setFetching(true);
    setFetchError(false);

    (async () => {
      try {
        const res = await fetch(pdfUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (blob.size === 0) throw new Error("Empty blob");
        const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
        if (!cancelled) {
          setBlobUrl(url);
          setFetching(false);
        } else {
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        console.error("PDF fetch error:", err);
        if (!cancelled) {
          setFetchError(true);
          setFetching(false);
          // Fallback: try using the URL directly
          setBlobUrl(pdfUrl);
        }
      }
    })();

    return () => {
      cancelled = true;
      setBlobUrl(prev => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl, open]);

  const handlePrint = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.print();
      } catch {
        // Cross-origin fallback: open in new window to print
        if (blobUrl) window.open(blobUrl, "_blank");
      }
    }
  }, [blobUrl]);

  const handleDownload = useCallback(() => {
    if (!pdfUrl && !blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl || pdfUrl!;
    a.download = "orcamento.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [pdfUrl, blobUrl]);

  const handleOpenChat = useCallback(() => {
    if (!clientId) {
      toast.error("Nenhum cliente vinculado à simulação");
      return;
    }
    onOpenChange(false);
    window.dispatchEvent(
      new CustomEvent("open-vendazap-chat-client", {
        detail: { clientId, attachmentUrl: pdfUrl },
      })
    );
    toast.success("Abrindo Chat de Vendas com o cliente...");
  }, [clientId, onOpenChange, pdfUrl]);

  const isLoading = loading || fetching;
  const showPdf = blobUrl && !isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0" aria-describedby="pdf-modal-desc">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            Visualização do Orçamento (PDF)
          </DialogTitle>
          <DialogDescription id="pdf-modal-desc" className="sr-only">
            Pré-visualização do orçamento em PDF com opções de imprimir, baixar e compartilhar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">Gerando PDF...</span>
            </div>
          ) : showPdf ? (
            <object
              data={blobUrl + "#toolbar=1&navpanes=0&view=FitH"}
              type="application/pdf"
              className="w-full h-full rounded-md border"
              title="PDF Preview"
            >
              {/* Fallback: iframe for browsers that don't support object for PDF */}
              <iframe
                ref={iframeRef}
                src={blobUrl + "#toolbar=1&navpanes=0"}
                className="w-full h-full rounded-md border"
                title="PDF Preview"
              />
            </object>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
              <p>Não foi possível carregar o PDF no visualizador.</p>
              {pdfUrl && (
                <Button variant="outline" size="sm" onClick={() => window.open(pdfUrl, "_blank")}>
                  Abrir em nova aba
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-2 flex flex-row gap-2 justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="gap-2">
            <X className="h-4 w-4" /> Fechar
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleOpenChat}
              disabled={isLoading || !clientId}
              className="gap-2 text-green-600 border-green-300 hover:bg-green-50 hover:text-green-700"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </Button>
            <Button variant="outline" onClick={handleDownload} disabled={!showPdf && !pdfUrl} className="gap-2">
              <Download className="h-4 w-4" /> Baixar
            </Button>
            <Button onClick={handlePrint} disabled={!showPdf} className="gap-2">
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
