import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download, X, Loader2, Share2 } from "lucide-react";
import { useRef, useEffect, useState } from "react";
import { toast } from "sonner";

interface PdfPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfUrl: string | null;
  loading?: boolean;
}

export function PdfPreviewModal({ open, onOpenChange, pdfUrl, loading }: PdfPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // Convert signed URL to blob URL for iframe compatibility
  useEffect(() => {
    if (!pdfUrl || !open) { setBlobUrl(null); return; }
    let revoked = false;
    (async () => {
      try {
        const res = await fetch(pdfUrl);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (!revoked) setBlobUrl(url);
        else URL.revokeObjectURL(url);
      } catch {
        // fallback: use the raw URL
        if (!revoked) setBlobUrl(pdfUrl);
      }
    })();
    return () => {
      revoked = true;
      if (blobUrl?.startsWith("blob:")) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl, open]);

  const handlePrint = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
    }
  };

  const handleDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl || pdfUrl;
    a.download = "orcamento.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleWhatsApp = async () => {
    if (!pdfUrl) return;
    if (navigator.share) {
      try {
        const response = await fetch(pdfUrl);
        const blob = await response.blob();
        const file = new File([blob], "orcamento.pdf", { type: "application/pdf" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            title: "Orçamento",
            text: "Segue o orçamento em PDF",
            files: [file],
          });
          return;
        }
      } catch {
        // fallback below
      }
    }
    const text = encodeURIComponent(`Segue o orçamento em PDF:\n${pdfUrl}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
    toast.success("Link copiado para envio via WhatsApp");
  };

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
          {loading && !blobUrl ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">Gerando PDF...</span>
            </div>
          ) : blobUrl ? (
            <iframe
              ref={iframeRef}
              src={blobUrl}
              className="w-full h-full rounded-md border"
              title="PDF Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Erro ao carregar PDF.
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
              onClick={handleWhatsApp}
              disabled={!blobUrl || loading}
              className="gap-2 text-green-600 border-green-300 hover:bg-green-50 hover:text-green-700"
            >
              <Share2 className="h-4 w-4" /> WhatsApp
            </Button>
            <Button variant="outline" onClick={handleDownload} disabled={!blobUrl || loading} className="gap-2">
              <Download className="h-4 w-4" /> Baixar
            </Button>
            <Button onClick={handlePrint} disabled={!blobUrl || loading} className="gap-2">
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
