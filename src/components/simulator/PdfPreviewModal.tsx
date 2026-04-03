import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download, X, Loader2, MessageCircle, AlertTriangle, ExternalLink } from "lucide-react";
import { useRef, useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface PdfPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfUrl: string | null;
  loading?: boolean;
  clientId?: string | null;
}

export function PdfPreviewModal({ open, onOpenChange, pdfUrl, loading, clientId }: PdfPreviewModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    if (!pdfUrl || !open) {
      setBlobUrl(null);
      setFetchError(false);
      setPageImages([]);
      return;
    }

    let cancelled = false;
    setFetching(true);
    setFetchError(false);
    setPageImages([]);

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

          // Render PDF pages to canvas images
          setRendering(true);
          try {
            const arrayBuffer = await blob.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const images: string[] = [];
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const scale = 2;
              const viewport = page.getViewport({ scale });
              const canvas = document.createElement("canvas");
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              const ctx = canvas.getContext("2d")!;
              await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
              images.push(canvas.toDataURL("image/png"));
            }
            if (!cancelled) setPageImages(images);
          } catch (renderErr) {
            console.error("PDF render error:", renderErr);
          } finally {
            if (!cancelled) setRendering(false);
          }
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

  const handlePrint = useCallback(() => {
    if (blobUrl) {
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

        <div className="flex-1 min-h-0 px-6 overflow-y-auto">
          {isLoading || rendering ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">
                {rendering ? "Renderizando páginas..." : "Gerando PDF..."}
              </span>
            </div>
          ) : pageImages.length > 0 ? (
            <div className="space-y-4 pb-2">
              {pageImages.map((src, index) => (
                <img
                  key={index}
                  src={src}
                  alt={`Página ${index + 1}`}
                  className="w-full rounded-md border shadow-sm"
                />
              ))}
            </div>
          ) : fetchError ? (
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
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>Nenhum PDF para exibir.</p>
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
            <Button variant="outline" onClick={handleDownload} disabled={!blobUrl && !pdfUrl} className="gap-2">
              <Download className="h-4 w-4" /> Baixar
            </Button>
            <Button onClick={handlePrint} disabled={!blobUrl} className="gap-2">
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
