import { memo, useMemo } from "react";
import { format } from "date-fns";
import { FileIcon, Monitor, Smartphone } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "./types";
import { ClosingThermometer, analyzeClientMessage } from "@/components/vendazap/ClosingThermometer";

interface Props {
  message: ChatMessage;
  showDate?: boolean;
}

function AttachmentPreview({ msg }: { msg: ChatMessage }) {
  if (!msg.anexo_url) return null;

  const tipo = msg.tipo_anexo || "";

  if (tipo.startsWith("image")) {
    return (
      <img
        src={msg.anexo_url}
        alt={msg.anexo_nome || "imagem"}
        className="max-w-[240px] rounded-md mt-1 cursor-pointer"
        loading="lazy"
        onClick={() => window.open(msg.anexo_url!, "_blank")}
      />
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