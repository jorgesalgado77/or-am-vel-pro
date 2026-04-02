import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download, X, Loader2, MessageCircle, AlertTriangle, ExternalLink } from "lucide-react";
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
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);

  useEffect(() => {
    if (!pdfUrl || !open) {
      setBlobUrl(null);
      setFetchError(false);
      setIframeLoaded(false);
      setRenderFailed(false);
      return;
    }

    let cancelled = false;
    setFetching(true);
    setFetchError(false);
    setIframeLoaded(false);
    setRenderFailed(false);

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
          // Give iframe time to render, if it doesn't load in 3s show fallback
          setTimeout(() => {
            if (!cancelled) setRenderFailed(prev => !iframeLoaded ? true : prev);
          }, 4000);
        } else {
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        console.error("PDF fetch error:", err);
        if (!cancelled) {
          setFetchError(true);
          setFetching(false);
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
  }, [pdfUrl, open]);

  const handleIframeLoad = useCallback(() => {
    setIframeLoaded(true);
    setRenderFailed(false);
  }, []);

  const handlePrint = useCallback(() => {
    if (blobUrl) {
      // Open blob in new window for printing
      const printWindow = window.open(blobUrl, "_blank");
      if (printWindow) {
        printWindow.addEventListener("load", () => {
          setTimeout(() => printWindow.print(), 500);
        });
      }
    }
  }, [blobUrl]);

  const handleDownload = useCallback(() => {
    const url = blobUrl || pdfUrl;
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
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
  const showPdf = blobUrl && !isLoading && !fetchError;

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
            <div className="w-full h-full relative">
              <iframe
                ref={iframeRef}
                src={blobUrl}
                className="w-full h-full rounded-md border"
                title="PDF Preview"
                onLoad={handleIframeLoad}
              />
              {/* If iframe fails to render PDF (shows blank), offer alternatives */}
              {renderFailed && !iframeLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/90 rounded-md">
                  <AlertTriangle className="h-8 w-8 text-yellow-500" />
                  <p className="text-sm text-muted-foreground">O navegador não suporta visualização inline de PDF.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(blobUrl!, "_blank")}>
                      <ExternalLink className="h-3.5 w-3.5" /> Abrir em nova aba
                    </Button>
                    <Button size="sm" className="gap-1.5" onClick={handleDownload}>
                      <Download className="h-3.5 w-3.5" /> Baixar PDF
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
              <p>Não foi possível carregar o PDF.</p>
              {pdfUrl && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => window.open(pdfUrl, "_blank")}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Abrir em nova aba
                  </Button>
                  <Button size="sm" onClick={handleDownload}>
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Baixar PDF
                  </Button>
                </div>
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
