import {memo} from "react";
import {Button} from "@/components/ui/button";
import {Lightbulb, Copy, Loader2} from "lucide-react";

interface Props {
  suggestion: string;
  loading: boolean;
  tipoCopy: string;
  onUse: () => void;
}

const TIPO_LABELS: Record<string, string> = {
  reativacao: "Reativação",
  fechamento: "🎯 Fechamento",
  reuniao: "Reunião",
  urgencia: "Urgência",
  geral: "Geral",
  resposta_automatica: "🤖 Auto-Pilot",
};

export const ChatAISuggestion = memo(function ChatAISuggestion({ suggestion, loading, tipoCopy, onUse }: Props) {
  if (!loading && !suggestion) return null;

  return (
    <div className="mx-3 mb-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Lightbulb className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-primary">Sugestão da IA</span>
        {tipoCopy && (
          <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
            {TIPO_LABELS[tipoCopy] || tipoCopy}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Analisando conversa...</span>
        </div>
      ) : (
        <>
          <p className="text-xs text-foreground leading-relaxed mb-2 whitespace-pre-wrap">
            {suggestion}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            onClick={onUse}
          >
            <Copy className="h-3 w-3" />
            Usar resposta
          </Button>
        </>
      )}
    </div>
  );
});
