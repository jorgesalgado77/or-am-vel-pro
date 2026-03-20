import { memo } from "react";
import { format } from "date-fns";
import { FileIcon, Play, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "./types";

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
  const time = format(new Date(message.created_at), "HH:mm");

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
        <div
          className={cn(
            "max-w-[75%] rounded-2xl px-3 py-1.5 text-sm shadow-sm",
            isLoja
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted text-foreground rounded-tl-sm"
          )}
        >
          <AttachmentPreview msg={message} />
          {message.mensagem && <p className="whitespace-pre-wrap break-words">{message.mensagem}</p>}
          <p className={cn("text-[10px] text-right mt-0.5", isLoja ? "opacity-70" : "text-muted-foreground")}>
            {time}
          </p>
        </div>
      </div>
    </>
  );
});
