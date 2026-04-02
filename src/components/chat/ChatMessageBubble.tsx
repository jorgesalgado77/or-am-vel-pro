import { memo, useMemo, useState, useEffect } from "react";
import { format } from "date-fns";
import { FileIcon, Monitor, Smartphone, Check, CheckCheck, FileText, X, Download, ExternalLink } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "./types";
import { ClosingThermometer, analyzeClientMessage } from "@/components/vendazap/ClosingThermometer";

interface Props {
  message: ChatMessage;
  showDate?: boolean;
}

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white/80 hover:text-white z-50 bg-black/40 rounded-full p-1"
        onClick={onClose}
      >
        <X className="h-6 w-6" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function AttachmentPreview({ msg }: { msg: ChatMessage }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!msg.anexo_url) return null;

  const tipo = msg.tipo_anexo || "";

  if (tipo.startsWith("image")) {
    return (
      <>
        <img
          src={msg.anexo_url}
          alt={msg.anexo_nome || "imagem"}
          className="max-w-[240px] rounded-md mt-1 cursor-zoom-in hover:opacity-90 transition-opacity"
          loading="lazy"
          onClick={() => setLightboxOpen(true)}
        />
        {lightboxOpen && (
          <ImageLightbox
            src={msg.anexo_url}
            alt={msg.anexo_nome || "imagem"}
            onClose={() => setLightboxOpen(false)}
          />
        )}
      </>
    );
  }

  if (tipo.startsWith("video")) {
    return (
      <video
        src={msg.anexo_url}
        controls
        preload="metadata"
        className="max-w-[280px] rounded-md mt-1"
      />
    );
  }

  if (tipo.startsWith("audio")) {
    return (
      <audio src={msg.anexo_url} controls preload="metadata" className="mt-1 max-w-[240px]" />
    );
  }

  // PDF preview with thumbnail
  if (tipo === "application/pdf" || msg.anexo_nome?.toLowerCase().endsWith(".pdf")) {
    return <PdfAttachmentPreview url={msg.anexo_url} name={msg.anexo_nome || "documento.pdf"} />;
  }

  return (
    <a
      href={msg.anexo_url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 mt-1 px-2 py-1.5 rounded bg-black/5 hover:bg-black/10 transition-colors text-xs"
    >
      <FileIcon className="h-4 w-4 shrink-0" />
      <span className="truncate">{msg.anexo_nome || "arquivo"}</span>
    </a>
  );
}

function ReadReceipt({ message }: { message: ChatMessage }) {
  // Only show for loja messages
  if (message.remetente_tipo !== "loja") return null;

  // Use status field if available (from delivery receipts), otherwise fall back to lida
  const status = message.status || (message.lida ? "delivered" : "sent");

  if (status === "read") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <CheckCheck className="h-3 w-3 text-blue-400 shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top"><p className="text-[10px]">Lida ✓✓</p></TooltipContent>
      </Tooltip>
    );
  }

  if (status === "delivered") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <CheckCheck className="h-3 w-3 opacity-50 shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top"><p className="text-[10px]">Entregue ✓✓</p></TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Check className="h-3 w-3 opacity-50 shrink-0" />
      </TooltipTrigger>
      <TooltipContent side="top"><p className="text-[10px]">Enviado ✓</p></TooltipContent>
    </Tooltip>
  );
}

export const ChatMessageBubble = memo(function ChatMessageBubble({ message, showDate }: Props) {
  const isLoja = message.remetente_tipo === "loja";
  const isCliente = message.remetente_tipo === "cliente";
  const time = format(new Date(message.created_at), "HH:mm");

  const clientAnalysis = useMemo(() => {
    if (isCliente && message.mensagem && message.mensagem.trim().length > 2) {
      return analyzeClientMessage(message.mensagem);
    }
    return null;
  }, [isCliente, message.mensagem]);

  const isMobileSent = isLoja && message.remetente_nome === "Você";
  const originTitle = isMobileSent ? "Enviado pelo celular" : "Enviado pelo sistema";
  const originDescription = isMobileSent
    ? "Detectado como mensagem enviada direto no WhatsApp do aparelho conectado, fora do Chat de Vendas."
    : "Mensagem enviada a partir do Chat de Vendas dentro do sistema.";

  return (
    <>
      {showDate && (
        <div className="flex justify-center my-3">
          <span className="text-[10px] bg-muted/80 text-muted-foreground px-3 py-0.5 rounded-full">
            {format(new Date(message.created_at), "dd/MM/yyyy")}
          </span>
        </div>
      )}
      <div className={cn("flex mb-1.5", isLoja ? "justify-end" : "justify-start")}>
        <div className="flex flex-col gap-1 max-w-[75%]">
          <div
            className={cn(
              "rounded-2xl px-3 py-1.5 text-sm shadow-sm",
              isLoja
                ? "bg-primary text-primary-foreground rounded-tr-sm"
                : "bg-muted text-foreground rounded-tl-sm"
            )}
          >
            <AttachmentPreview msg={message} />
            {message.mensagem && <p className="whitespace-pre-wrap break-words">{message.mensagem}</p>}
            <p className={cn("text-[10px] text-right mt-0.5 flex items-center justify-end gap-1", isLoja ? "opacity-70" : "text-muted-foreground")}>
              {isLoja && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-help" aria-label={originTitle}>
                      {isMobileSent ? (
                        <Smartphone className="h-2.5 w-2.5 inline-block" />
                      ) : (
                        <Monitor className="h-2.5 w-2.5 inline-block" />
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px]">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold">{originTitle}</p>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">{originDescription}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
              {time}
              <ReadReceipt message={message} />
            </p>
          </div>
          {clientAnalysis && (
            <ClosingThermometer score={clientAnalysis.score} compact />
          )}
        </div>
      </div>
    </>
  );
});
